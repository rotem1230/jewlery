import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  acceptQuote,
  createPublishedJeweler,
  firstRegionId,
  itemTypeId,
  registerVerified,
  TestQuote,
} from '../utils/factories';

/**
 * The PRD's core journey end to end, through the API the app uses: a designer specifies a ring
 * from the PRD size chart and publishes it in a region; a jeweler gets the request on their board,
 * talks and quotes; the designer compares and accepts; the handoff link reaches the chat; the
 * design is completed by the jeweler's business; and the designer later becomes a jeweler too.
 */
describe('PRD journey: design → request → chat → quote → acceptance → handoff', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('runs end to end as the PRD describes', async () => {
    const regionId = await firstRegionId(t);
    const designer = await registerVerified(t);
    const jeweler = await createPublishedJeweler(t, { businessName: 'Golden Hands' }, { regionId });

    // 5.4 — the ring is sized from the PRD chart (IL 54 = US 7.00).
    const chart = (await t.http.get(`${API}/wizard/size-charts/RING`).expect(200)).body.data as Array<{
      standard: string;
      sizeCode: string;
      sortOrder: number;
    }>;
    const il54 = chart.find((row) => row.standard === 'IL' && row.sizeCode === '54');
    expect(chart.find((row) => row.standard === 'US' && row.sortOrder === il54?.sortOrder)?.sizeCode).toBe('7.00');
    const parameters = {
      size: { standard: 'IL', sizeCode: '54', bandWidthMm: 3 },
      metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' },
      stones: [{ stoneCode: 'DIAMOND', shape: 'ROUND', sizeMm: 5 }],
      personalNote: 'Thin band please',
    };
    const created = await t.http
      .post(`${API}/designs`)
      .set(designer.auth)
      .send({ itemTypeId: await itemTypeId(t), title: 'Journey ring', parameters })
      .expect(201);
    const designId = created.body.data.id as string;

    // 5.5 — published in a region, it is listed in the Atelier for that region.
    await t.http.patch(`${API}/designs/${designId}`).set(designer.auth).send({ version: 1, preferredRegionId: regionId }).expect(200);
    await t.http.post(`${API}/designs/${designId}/transition`).set(designer.auth).send({ toStatus: 'PUBLISHED' }).expect(201);
    const listed = await t.http.get(`${API}/atelier/designs`).query({ regionId }).expect(200);
    expect((listed.body.data.items as Array<{ id: string }>).map((d) => d.id)).toContain(designId);
    const listing = await t.http.get(`${API}/atelier/designs/${designId}`).expect(200);
    expect(listing.body.data.expiresAt).toEqual(expect.any(String));

    // 5.5 / 5.11 — a targeted request lands on the jeweler's board as New.
    const request = await t.http
      .post(`${API}/atelier/requests`)
      .set(designer.auth)
      .send({ designId, mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] })
      .expect(201);
    const requestId = request.body.data.id as string;
    const board = async () =>
      ((await t.http.get(`${API}/jeweler-profiles/me/orders`).set(jeweler.auth).expect(200)).body.data.items as Array<{
        id: string;
        myStatus: string;
      }>).find((order) => order.id === requestId)?.myStatus;
    expect(await board()).toBe('NEW');
    const home = await t.http.get(`${API}/home/summary`).set(jeweler.auth).expect(200);
    expect(home.body.data.newRequests).toBeGreaterThanOrEqual(1);

    // The jeweler sees the full specification on the request.
    const details = await t.http.get(`${API}/atelier/requests/${requestId}`).set(jeweler.auth).expect(200);
    expect(details.body.data.design.parameters.personalNote).toBe('Thin band please');

    // 5.6 — they talk; the designer's home shows the new message.
    const chat = await t.http.post(`${API}/conversations`).set(jeweler.auth).send({ designId, participantUserIds: [designer.id] }).expect(201);
    const conversationId = chat.body.data.id as string;
    await t.http.post(`${API}/conversations/${conversationId}/messages`).set(jeweler.auth).send({ type: 'TEXT', body: 'Lovely design!' }).expect(201);
    const designerHome = await t.http.get(`${API}/home/summary`).set(designer.auth).expect(200);
    expect((designerHome.body.data.recentNotifications as Array<{ eventKey: string }>).map((n) => n.eventKey)).toContain('message.new');

    // The jeweler quotes: the card in the chat carries the real figures.
    const quoted = await t.http
      .post(`${API}/quotes`)
      .set(jeweler.auth)
      .send({ conversationId, designId, designRequestId: requestId, materialsCost: 3200, laborCost: 1300.5, etaBusinessDays: 21, notes: 'Includes polishing' })
      .expect(201);
    const quote = quoted.body.data as TestQuote;
    expect(await board()).toBe('QUOTE_SUBMITTED');
    const messages = await t.http.get(`${API}/conversations/${conversationId}/messages`).set(designer.auth).expect(200);
    const card = (messages.body.data.items as Array<{ type: string; quote?: { totalPrice: string; design: { itemType: { code: string } } } }>).find(
      (m) => m.type === 'QUOTE_CARD',
    );
    expect(Number(card?.quote?.totalPrice)).toBe(4500.5);
    expect(card?.quote?.design.itemType.code).toBe('RING');

    // The designer answers: the order is under negotiation.
    await t.http.post(`${API}/conversations/${conversationId}/messages`).set(designer.auth).send({ type: 'TEXT', body: 'Can you do 14K?' }).expect(201);
    expect(await board()).toBe('NEGOTIATING');

    // The designer compares the quotes the design received, then accepts this one.
    const quotes = await t.http.get(`${API}/designs/${designId}/quotes`).set(designer.auth).expect(200);
    expect(quotes.body.data).toEqual([expect.objectContaining({ id: quote.id, status: 'PENDING', author: expect.objectContaining({ businessName: 'Golden Hands' }) })]);
    await acceptQuote(t, designer, quote).expect(201);

    // The PRD system message and the WhatsApp handoff link are in the chat.
    const after = await t.http.get(`${API}/conversations/${conversationId}/messages`).set(designer.auth).expect(200);
    const system = (after.body.data.items as Array<{ type: string; body: string | null; payload: { whatsappUrl?: string } | null }>).filter(
      (m) => m.type === 'SYSTEM',
    );
    expect(system.map((m) => m.body).join('\n')).toContain('ההצעה אושרה בהצלחה');
    expect(system.map((m) => m.payload?.whatsappUrl).filter(Boolean)).toEqual(['https://wa.me/972501234567']);

    // Completed: by the jeweler's business, on both boards.
    const design = await t.http.get(`${API}/designs/${designId}`).set(designer.auth).expect(200);
    expect(design.body.data.status).toBe('COMPLETED');
    expect(design.body.data.completedBy.name).toBe('Golden Hands');
    expect(await board()).toBe('COMPLETED');

    // 5.1 — the designer later opens a workshop too, and switches to it.
    const roles = await t.http.post(`${API}/auth/roles`).set(designer.auth).send({ role: 'JEWELER' }).expect(201);
    const next = { Authorization: `Bearer ${roles.body.data.tokens.accessToken as string}` };
    const switched = await t.http.post(`${API}/auth/switch-role`).set(next).send({ role: 'JEWELER' }).expect(201);
    expect(switched.body.data.user.activeRole).toBe('JEWELER');
  });
});
