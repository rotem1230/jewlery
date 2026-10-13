import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  acceptQuote,
  createPublishedJeweler,
  createQuote,
  marketplaceScenario,
  openConversation,
  registerVerified,
} from '../utils/factories';

/**
 * Regression for the critical finding: any participant (including the quote's own author)
 * could accept a quote, completing someone else's design and auto-declining competitors.
 * Only the design owner decides on quotes; decisions are atomic under concurrency.
 */
describe('quote decisions', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function designState(designId: string) {
    return t.prisma.design.findUniqueOrThrow({ where: { id: designId } });
  }

  it('the author cannot accept their own quote', async () => {
    const { jeweler, design, conversation } = await marketplaceScenario(t);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);

    await acceptQuote(t, jeweler, quote).expect(403);

    expect((await designState(design.id)).status).toBe('PUBLISHED');
    const stored = await t.prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(stored.status).toBe('PENDING');
  });

  it('a participant who does not own the design cannot accept', async () => {
    const { designer, jeweler, design } = await marketplaceScenario(t);
    const intruder = await registerVerified(t);
    // A legacy group conversation created before participant rules existed.
    const legacy = await t.prisma.conversation.create({
      data: {
        designId: design.id,
        participants: { create: [{ userId: designer.id }, { userId: jeweler.id }, { userId: intruder.id }] },
      },
    });
    const quote = await createQuote(t, jeweler, legacy.id, design.id);

    await acceptQuote(t, intruder, quote).expect(403);
    expect((await designState(design.id)).status).toBe('PUBLISHED');
  });

  it('accepting competitor quotes is impossible for a rival jeweler', async () => {
    const { designer, design, jeweler, conversation } = await marketplaceScenario(t);
    const legit = await createQuote(t, jeweler, conversation.id, design.id);

    const rival = await createPublishedJeweler(t);
    const rivalConversation = await openConversation(t, rival, design.id, [designer.id]);
    const rivalQuote = await createQuote(t, rival, rivalConversation.id, design.id);

    await acceptQuote(t, rival, rivalQuote).expect(403);

    const legitStored = await t.prisma.quote.findUniqueOrThrow({ where: { id: legit.id } });
    expect(legitStored.status).toBe('PENDING');
  });

  it('only the design owner can decline', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);

    await t.http.post(`${API}/quotes/${quote.id}/decline`).set(jeweler.auth).send({}).expect(403);
    await t.http.post(`${API}/quotes/${quote.id}/decline`).set(designer.auth).send({}).expect(201);
  });

  it('the author can withdraw a pending quote but the owner cannot', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);

    await t.http.post(`${API}/quotes/${quote.id}/withdraw`).set(designer.auth).send({}).expect(403);
    const res = await t.http.post(`${API}/quotes/${quote.id}/withdraw`).set(jeweler.auth).send({}).expect(201);
    expect(res.body.data.status).toBe('WITHDRAWN');
  });

  it('an expired quote cannot be accepted', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);
    await t.prisma.quote.update({ where: { id: quote.id }, data: { validUntil: new Date(Date.now() - 60_000) } });

    const res = await acceptQuote(t, designer, quote).expect(409);
    expect(res.body.code).toBe('QUOTE_EXPIRED');
    expect((await designState(design.id)).status).toBe('PUBLISHED');
  });

  it('accept refuses a price that changed since the owner looked at it', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);
    await t.http.patch(`${API}/quotes/${quote.id}`).set(jeweler.auth).send({ laborCost: 900 }).expect(200);

    const stale = await acceptQuote(t, designer, quote).expect(409);
    expect(stale.body.code).toBe('QUOTE_CHANGED');
    expect(stale.body.currentTotalPrice).toBe('1000');

    await acceptQuote(t, designer, { ...quote, totalPrice: '1000' }).expect(201);
  });

  it('accept requires the price and currency the owner agreed to', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);

    await t.http.post(`${API}/quotes/${quote.id}/accept`).set(designer.auth).send({}).expect(400);
    await t.http
      .post(`${API}/quotes/${quote.id}/accept`)
      .set(designer.auth)
      .send({ expectedTotalPrice: 150 })
      .expect(400);
    expect((await t.prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe('PENDING');
  });

  it('accept refuses a quote whose currency is not the one the owner saw', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);

    const res = await acceptQuote(t, designer, { ...quote, currency: 'USD' }).expect(409);
    expect(res.body.code).toBe('QUOTE_CHANGED');
    expect((await designState(design.id)).status).toBe('PUBLISHED');
  });

  it('editing a pending quote refreshes the price on its chat card', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);
    await t.http.patch(`${API}/quotes/${quote.id}`).set(jeweler.auth).send({ materialsCost: 400 }).expect(200);

    const messages = await t.http
      .get(`${API}/conversations/${conversation.id}/messages`)
      .set(designer.auth)
      .expect(200);
    const card = (messages.body.data.items as Array<{ type: string; payload: { totalPrice: string } }>).find(
      (m) => m.type === 'QUOTE_CARD',
    );
    expect(card?.payload.totalPrice).toBe('450');
  });

  it('simultaneous accepts of one quote complete the design exactly once', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        acceptQuote(t, designer, quote),
      ),
    );
    expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    expect(results.some((r) => r.status === 201)).toBe(true);

    const stored = await designState(design.id);
    expect(stored.status).toBe('COMPLETED');
    expect(stored.acceptedQuoteId).toBe(quote.id);
    const systemMessages = await t.prisma.message.count({
      where: { conversationId: conversation.id, type: 'SYSTEM' },
    });
    expect(systemMessages).toBe(2);
  });

  it('the authors of auto-declined quotes are notified through the outbox, with the decision', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const accepted = await createQuote(t, jeweler, conversation.id, design.id);
    const rival = await createPublishedJeweler(t);
    const rivalConversation = await openConversation(t, rival, design.id, [designer.id]);
    const declined = await createQuote(t, rival, rivalConversation.id, design.id);

    await acceptQuote(t, designer, accepted).expect(201);
    const queued = await t.prisma.outboxEvent.findMany({ where: { type: 'notification.push' } });
    expect(queued.map((event) => event.payload)).toContainEqual(
      expect.objectContaining({ userId: rival.id, eventKey: 'quote.declined', quoteId: declined.id }),
    );
  });

  it('two competing quotes accepted at the same time: exactly one wins', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const first = await createQuote(t, jeweler, conversation.id, design.id);
    const rival = await createPublishedJeweler(t);
    const rivalConversation = await openConversation(t, rival, design.id, [designer.id]);
    const second = await createQuote(t, rival, rivalConversation.id, design.id);

    const results = await Promise.all([
      acceptQuote(t, designer, first),
      acceptQuote(t, designer, second),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);

    const quotes = await t.prisma.quote.findMany({ where: { designId: design.id } });
    expect(quotes.filter((q) => q.status === 'ACCEPTED')).toHaveLength(1);
    const winner = quotes.find((q) => q.status === 'ACCEPTED');
    expect((await designState(design.id)).acceptedQuoteId).toBe(winner?.id);
  });
});
