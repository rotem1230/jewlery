import { lockRow, waitForLockWaiters } from '../utils/db-locks';
import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  acceptQuote,
  createPublishedJeweler,
  createQuote,
  marketplaceScenario,
  openConversation,
} from '../utils/factories';

/**
 * Deterministic interleavings of quote decisions with concurrent edits. A row lock held by the
 * test stops one request at a precise point while another one changes the data underneath it.
 */
describe('quote decisions under concurrent changes', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('a price edit landing while the accept is in progress is never accepted at the new price', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);

    const lock = await lockRow(t, 'designs', s.design.id);
    const accepting = acceptQuote(t, s.designer, quote).then((res) => res);
    await waitForLockWaiters(t, 1);
    await t.http.patch(`${API}/quotes/${quote.id}`).set(s.jeweler.auth).send({ laborCost: 900 }).expect(200);
    await lock.release();

    const res = await accepting;
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTE_CHANGED');
    const stored = await t.prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(stored.status).toBe('PENDING');
    expect(stored.totalPrice.toString()).toBe('1000');
    expect((await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } })).status).toBe('PUBLISHED');
  });

  it('a quote submitted while a competing quote is accepted does not stay pending on a completed design', async () => {
    const s = await marketplaceScenario(t);
    const rival = await createPublishedJeweler(t);
    const rivalConversation = await openConversation(t, rival, s.design.id, [s.designer.id]);
    const winner = await createQuote(t, rival, rivalConversation.id, s.design.id);

    const lock = await lockRow(t, 'conversations', s.conversation.id);
    const submitting = t.http
      .post(`${API}/quotes`)
      .set(s.jeweler.auth)
      .send({
        conversationId: s.conversation.id,
        designId: s.design.id,
        materialsCost: 10,
        laborCost: 5,
        etaBusinessDays: 3,
      })
      .then((res) => res);
    await waitForLockWaiters(t, 1);
    const accepting = acceptQuote(t, s.designer, winner).then((res) => res);
    await Promise.race([accepting, waitForLockWaiters(t, 2)]);
    await lock.release();

    expect((await accepting).status).toBe(201);
    expect([201, 409]).toContain((await submitting).status);
    const design = await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } });
    expect(design.status).toBe('COMPLETED');
    expect(design.acceptedQuoteId).toBe(winner.id);
    expect(await t.prisma.quote.count({ where: { designId: s.design.id, status: 'PENDING' } })).toBe(0);
  });

  it('a quote withdrawn during an accept is not reported as declined', async () => {
    const s = await marketplaceScenario(t);
    const accepted = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    const rival = await createPublishedJeweler(t);
    const rivalConversation = await openConversation(t, rival, s.design.id, [s.designer.id]);
    const withdrawn = await createQuote(t, rival, rivalConversation.id, s.design.id);

    const lock = await lockRow(t, 'quotes', withdrawn.id);
    const accepting = acceptQuote(t, s.designer, accepted).then((res) => res);
    await waitForLockWaiters(t, 1);
    await lock.release((tx) => tx.quote.update({ where: { id: withdrawn.id }, data: { status: 'WITHDRAWN' } }));

    expect((await accepting).status).toBe(201);
    const stored = await t.prisma.quote.findUniqueOrThrow({ where: { id: withdrawn.id } });
    expect(stored.status).toBe('WITHDRAWN');
    expect(await t.prisma.quoteEvent.count({ where: { quoteId: withdrawn.id, toStatus: 'DECLINED' } })).toBe(0);
    expect(await t.prisma.notification.count({ where: { userId: rival.id, eventKey: 'quote.declined' } })).toBe(0);
  });

  it('an accept either commits with its notifications queued, or not at all', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);

    await t.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_quote_accepted_outbox() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'quote.accepted' THEN RAISE EXCEPTION 'injected outbox failure'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await t.prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_quote_accepted_outbox BEFORE INSERT ON "outbox_events"
      FOR EACH ROW EXECUTE FUNCTION test_fail_quote_accepted_outbox()`);
    try {
      const res = await acceptQuote(t, s.designer, quote);
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      await t.prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_quote_accepted_outbox ON "outbox_events"`);
      await t.prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_fail_quote_accepted_outbox()`);
    }

    expect((await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } })).status).toBe('PUBLISHED');
    expect((await t.prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe('PENDING');
    expect(await t.prisma.message.count({ where: { conversationId: s.conversation.id, type: 'SYSTEM' } })).toBe(0);

    await acceptQuote(t, s.designer, quote).expect(201);
    const queued = await t.prisma.outboxEvent.findMany({
      where: { type: { in: ['quote.accepted', 'handoff.created'] }, payload: { path: ['quoteId'], equals: quote.id } },
    });
    expect(queued.map((e) => e.type).sort()).toEqual(['handoff.created', 'quote.accepted']);
  });
});

describe('quote amounts and completed designs', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('a total above the storable maximum is a validation error, not a server error', async () => {
    const s = await marketplaceScenario(t);
    const res = await t.http
      .post(`${API}/quotes`)
      .set(s.jeweler.auth)
      .send({
        conversationId: s.conversation.id,
        designId: s.design.id,
        materialsCost: 9_999_999_999.99,
        laborCost: 1,
        etaBusinessDays: 3,
      })
      .expect(400);
    expect(res.body.code).toBe('QUOTE_TOTAL_TOO_LARGE');

    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    const update = await t.http
      .patch(`${API}/quotes/${quote.id}`)
      .set(s.jeweler.auth)
      .send({ materialsCost: 9_999_999_999.99 })
      .expect(400);
    expect(update.body.code).toBe('QUOTE_TOTAL_TOO_LARGE');
  });

  it('currency codes are stored upper-case, so the owner confirms exactly what is stored', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id, { currency: 'usd' });
    expect(quote.currency).toBe('USD');
    await t.http.patch(`${API}/quotes/${quote.id}`).set(s.jeweler.auth).send({ currency: 'eur' }).expect(200);
    await acceptQuote(t, s.designer, { ...quote, currency: 'EUR' }).expect(201);
  });

  it('a design completed through an accepted quote cannot be put back on the market', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    await acceptQuote(t, s.designer, quote).expect(201);

    const transition = (toStatus: string) =>
      t.http.post(`${API}/designs/${s.design.id}/transition`).set(s.designer.auth).send({ toStatus });
    await transition('ARCHIVED').expect(201);
    const republish = await transition('PUBLISHED').expect(409);
    expect(republish.body.code).toBe('DESIGN_COMPLETED');
    const backToDraft = await transition('DRAFT').expect(409);
    expect(backToDraft.body.code).toBe('DESIGN_COMPLETED');
  });

  it('a design is completed only by accepting a quote, never by a bare status change', async () => {
    const s = await marketplaceScenario(t);
    const res = await t.http
      .post(`${API}/designs/${s.design.id}/transition`)
      .set(s.designer.auth)
      .send({ toStatus: 'COMPLETED' })
      .expect(409);
    expect(res.body.code).toBe('COMPLETE_BY_ACCEPTING_A_QUOTE');
    expect((await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } })).status).toBe('PUBLISHED');
  });
});
