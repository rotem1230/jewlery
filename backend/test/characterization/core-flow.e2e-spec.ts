import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  acceptQuote,
  createPublishedDesign,
  createPublishedJeweler,
  createQuote,
  openConversation,
  registerVerified,
} from '../utils/factories';

/**
 * Characterization of the main marketplace journey. It must stay green through every hardening
 * change: designer publishes a design, a jeweler with a published profile gets a targeted
 * request, chats, quotes, and the designer accepts.
 */
describe('core marketplace flow', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('designer -> request -> conversation -> quote -> accept completes the design', async () => {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const jeweler = await createPublishedJeweler(t);

    const request = await t.http
      .post(`${API}/atelier/requests`)
      .set(designer.auth)
      .send({ designId: design.id, mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] })
      .expect(201);

    const conversation = await openConversation(t, jeweler, design.id, [designer.id]);
    const quote = await createQuote(t, jeweler, conversation.id, design.id, {
      designRequestId: request.body.data.id,
    });
    expect(quote.totalPrice).toBe('150');

    const accepted = await acceptQuote(t, designer, quote).expect(201);
    expect(accepted.body.data.status).toBe('ACCEPTED');

    const stored = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    expect(stored.status).toBe('COMPLETED');
    expect(stored.acceptedQuoteId).toBe(quote.id);
    expect(stored.completedByJewelerId).toBe(jeweler.id);

    const messages = await t.http
      .get(`${API}/conversations/${conversation.id}/messages`)
      .set(designer.auth)
      .expect(200);
    const types = (messages.body.data.items as Array<{ type: string }>).map((m) => m.type);
    expect(types).toEqual(['QUOTE_CARD', 'SYSTEM', 'SYSTEM']);
  });
});
