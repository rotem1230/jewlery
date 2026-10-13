import { lockRow, waitForLockWaiters } from '../utils/db-locks';
import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  acceptQuote,
  createPublishedDesign,
  createPublishedJeweler,
  createQuote,
  openConversation,
  registerVerified,
  TestJeweler,
  TestQuote,
  TestUser,
  VALID_RING_PARAMETERS,
} from '../utils/factories';

/**
 * PRD 5.11 (jeweler order board) and 5.3/5.5: every jeweler a request reaches has their own
 * status (New / Quote submitted / Negotiating / Completed), a request can be declined, a quote is
 * accepted only for the design it priced, and jewelers see the design they are asked to quote.
 */
describe('jeweler order board', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  type Order = { id: string; myStatus: string };

  async function orders(jeweler: TestJeweler, tab = 'all'): Promise<Order[]> {
    const res = await t.http.get(`${API}/jeweler-profiles/me/orders`).query({ tab }).set(jeweler.auth).expect(200);
    return res.body.data.items as Order[];
  }

  async function myStatus(jeweler: TestJeweler, requestId: string): Promise<string | undefined> {
    return (await orders(jeweler)).find((order) => order.id === requestId)?.myStatus;
  }

  async function counters(jeweler: TestJeweler): Promise<{ newRequests: number; inProgress: number }> {
    const res = await t.http.get(`${API}/home/summary`).set(jeweler.auth).expect(200);
    return { newRequests: res.body.data.newRequests, inProgress: res.body.data.inProgress };
  }

  /** A published design requested from two jewelers, each with a conversation with the designer. */
  async function requestedFromTwo() {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const first = await createPublishedJeweler(t);
    const second = await createPublishedJeweler(t);
    const request = await t.http
      .post(`${API}/atelier/requests`)
      .set(designer.auth)
      .send({ designId: design.id, mode: 'TARGETED', targetJewelerProfileIds: [first.profileId, second.profileId] })
      .expect(201);
    const requestId = request.body.data.id as string;
    const firstChat = await openConversation(t, first, design.id, [designer.id]);
    const secondChat = await openConversation(t, second, design.id, [designer.id]);
    const quote = (jeweler: TestJeweler, chat: { id: string }, extra: Record<string, unknown> = {}) =>
      createQuote(t, jeweler, chat.id, design.id, { designRequestId: requestId, ...extra });
    return { designer, design, first, second, requestId, firstChat, secondChat, quote };
  }

  function say(user: TestUser, chat: { id: string }, body: string) {
    return t.http.post(`${API}/conversations/${chat.id}/messages`).set(user.auth).send({ type: 'TEXT', body }).expect(201);
  }

  it("a quote by one jeweler moves only that jeweler's order; the other still sees a new request", async () => {
    const s = await requestedFromTwo();
    expect(await counters(s.first)).toEqual({ newRequests: 1, inProgress: 0 });

    await s.quote(s.first, s.firstChat);

    expect(await myStatus(s.first, s.requestId)).toBe('QUOTE_SUBMITTED');
    expect((await orders(s.first, 'quote_submitted')).map((o) => o.id)).toContain(s.requestId);
    expect(await counters(s.first)).toEqual({ newRequests: 0, inProgress: 1 });
    expect(await myStatus(s.second, s.requestId)).toBe('NEW');
    expect(await counters(s.second)).toEqual({ newRequests: 1, inProgress: 0 });
    expect((await orders(s.second, 'quote_submitted')).map((o) => o.id)).not.toContain(s.requestId);
  });

  it('the designer answering after a quote moves the order to Negotiating', async () => {
    const s = await requestedFromTwo();
    await s.quote(s.first, s.firstChat);
    await say(s.first, s.firstChat, 'Here is my offer');
    expect(await myStatus(s.first, s.requestId)).toBe('QUOTE_SUBMITTED');

    await say(s.designer, s.firstChat, 'Can you do it in 14K?');
    expect(await myStatus(s.first, s.requestId)).toBe('NEGOTIATING');
    expect((await orders(s.first, 'negotiating')).map((o) => o.id)).toContain(s.requestId);
    expect(await counters(s.first)).toEqual({ newRequests: 0, inProgress: 1 });
  });

  it("accepting a quote completes the winner's order and closes the others'", async () => {
    const s = await requestedFromTwo();
    const winning = await s.quote(s.first, s.firstChat);
    await s.quote(s.second, s.secondChat, { laborCost: 80 });

    await acceptQuote(t, s.designer, winning).expect(201);

    expect(await myStatus(s.first, s.requestId)).toBe('COMPLETED');
    expect((await orders(s.first, 'completed')).map((o) => o.id)).toContain(s.requestId);
    expect(await myStatus(s.second, s.requestId)).toBe('CLOSED');
    expect(await counters(s.second)).toEqual({ newRequests: 0, inProgress: 0 });
  });

  it('a declined quote closes the order; a withdrawn one returns it to New', async () => {
    const s = await requestedFromTwo();
    const declined = await s.quote(s.first, s.firstChat);
    await t.http.post(`${API}/quotes/${declined.id}/decline`).set(s.designer.auth).send({}).expect(201);
    expect(await myStatus(s.first, s.requestId)).toBe('CLOSED');

    const withdrawn = await s.quote(s.second, s.secondChat);
    await t.http.post(`${API}/quotes/${withdrawn.id}/withdraw`).set(s.second.auth).send({}).expect(201);
    expect(await myStatus(s.second, s.requestId)).toBe('NEW');
  });

  it('a jeweler can decline a request, which leaves the board and the counters', async () => {
    const s = await requestedFromTwo();
    await t.http.post(`${API}/jeweler-profiles/me/orders/${s.requestId}/decline`).set(s.first.auth).send({}).expect(201);

    expect(await counters(s.first)).toEqual({ newRequests: 0, inProgress: 0 });
    expect((await orders(s.first)).map((o) => o.id)).not.toContain(s.requestId);
    // The other jeweler is unaffected.
    expect(await myStatus(s.second, s.requestId)).toBe('NEW');
  });

  it('a request with a pending quote is not declined until the quote is withdrawn', async () => {
    const s = await requestedFromTwo();
    await s.quote(s.first, s.firstChat);
    const res = await t.http
      .post(`${API}/jeweler-profiles/me/orders/${s.requestId}/decline`)
      .set(s.first.auth)
      .send({})
      .expect(409);
    expect(res.body.code).toBe('QUOTE_PENDING');
  });

  it('a quote the jeweler sends while declining wins: the request is not declined under it', async () => {
    const s = await requestedFromTwo();
    // The jeweler's account is busy (as while one of their quotes is being created).
    const held = await lockRow(t, 'users', s.first.id);
    const decline = t.http.post(`${API}/jeweler-profiles/me/orders/${s.requestId}/decline`).set(s.first.auth).send({});
    const result = decline.then((res) => res);
    await waitForLockWaiters(t, 1);
    // The quote commits first, under the account lock.
    await held.release((tx) =>
      tx.quote.create({
        data: {
          designId: s.design.id,
          designRequestId: s.requestId,
          conversationId: s.firstChat.id,
          authorUserId: s.first.id,
          materialsCost: 100,
          laborCost: 50,
          totalPrice: 150,
          currency: 'ILS',
          etaBusinessDays: 10,
          status: 'PENDING',
        },
      }),
    );
    const res = await result;
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTE_PENDING');
    expect(await myStatus(s.first, s.requestId)).not.toBe('DECLINED');
  });

  it('the board counts every tab, not only the one shown', async () => {
    const s = await requestedFromTwo();
    await s.quote(s.first, s.firstChat);
    const res = await t.http.get(`${API}/jeweler-profiles/me/orders`).query({ tab: 'completed' }).set(s.first.auth).expect(200);
    expect(res.body.data.tabCounts).toMatchObject({ all: 1, quote_submitted: 1, negotiating: 0, completed: 0 });
  });

  it("the request shows the jeweler's own quote on the design, also one sent from the feed", async () => {
    const s = await requestedFromTwo();
    const fromFeed = await createQuote(t, s.first, s.firstChat.id, s.design.id);
    const res = await t.http.get(`${API}/atelier/requests/${s.requestId}`).set(s.first.auth).expect(200);
    expect((res.body.data.quotes as Array<{ id: string }>).map((q) => q.id)).toEqual([fromFeed.id]);
    // The other jeweler sees none of it.
    const other = await t.http.get(`${API}/atelier/requests/${s.requestId}`).set(s.second.auth).expect(200);
    expect(other.body.data.quotes).toEqual([]);
  });

  it('editing a quote that is no longer pending is a conflict the app can name', async () => {
    const s = await requestedFromTwo();
    const quote = await s.quote(s.first, s.firstChat);
    await t.http.post(`${API}/quotes/${quote.id}/withdraw`).set(s.first.auth).send({}).expect(201);
    const res = await t.http.patch(`${API}/quotes/${quote.id}`).set(s.first.auth).send({ laborCost: 90 }).expect(409);
    expect(res.body.code).toBe('QUOTE_NOT_PENDING');
  });

  it("deleting the designer's account closes the jewelers' orders", async () => {
    const s = await requestedFromTwo();
    await t.http.delete(`${API}/users/me`).set(s.designer.auth).expect(200);
    expect(await counters(s.first)).toEqual({ newRequests: 0, inProgress: 0 });
    expect(await myStatus(s.first, s.requestId)).toBe('CLOSED');
  });

  it('a jeweler sees the full design on a request sent to them', async () => {
    const s = await requestedFromTwo();
    const res = await t.http.get(`${API}/atelier/requests/${s.requestId}`).set(s.first.auth).expect(200);
    const design = res.body.data.design as { parameters?: { metal?: unknown }; itemType?: { code: string }; description?: unknown };
    expect(design.parameters?.metal).toEqual(VALID_RING_PARAMETERS.metal);
    expect(design.itemType?.code).toBe('RING');
    expect(design).toHaveProperty('description');
  });

  describe('a quote is accepted only for the design it priced', () => {
    async function quoted() {
      const s = await requestedFromTwo();
      const quote = await s.quote(s.first, s.firstChat);
      return { ...s, quote };
    }

    async function editMetal(designer: TestUser, designId: string) {
      const current = await t.prisma.design.findUniqueOrThrow({ where: { id: designId } });
      await t.http
        .patch(`${API}/designs/${designId}`)
        .set(designer.auth)
        .send({ version: current.version, parameters: { ...VALID_RING_PARAMETERS, metal: { metalCode: 'WHITE_GOLD', purityCode: '18K' } } })
        .expect(200);
    }

    it('a design changed after the quote cannot be accepted at the old price', async () => {
      const s = await quoted();
      await editMetal(s.designer, s.design.id);

      const res = await acceptQuote(t, s.designer, s.quote).expect(409);
      expect(res.body.code).toBe('DESIGN_CHANGED_SINCE_QUOTE');
      const design = await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } });
      expect(design.status).toBe('PUBLISHED');
    });

    it('once the jeweler re-prices the changed design, the quote can be accepted', async () => {
      const s = await quoted();
      await editMetal(s.designer, s.design.id);
      const repriced = await t.http.patch(`${API}/quotes/${s.quote.id}`).set(s.first.auth).send({ laborCost: 90 }).expect(200);

      await acceptQuote(t, s.designer, repriced.body.data as TestQuote).expect(201);
    });

    it('locking a field or archiving and republishing, without changing the design, keeps the quote valid', async () => {
      const s = await quoted();
      await t.http.post(`${API}/designs/${s.design.id}/lock`).set(s.designer.auth).send({ fields: ['metal'], confirm: true }).expect(201);
      await t.http.post(`${API}/designs/${s.design.id}/transition`).set(s.designer.auth).send({ toStatus: 'ARCHIVED' }).expect(201);
      await t.http.post(`${API}/designs/${s.design.id}/transition`).set(s.designer.auth).send({ toStatus: 'PUBLISHED' }).expect(201);

      await acceptQuote(t, s.designer, s.quote).expect(201);
    });
  });

  describe('published designs by id, and listing expiry', () => {
    it('a published design opens by id; a draft of someone else does not', async () => {
      const designer = await registerVerified(t);
      const published = await createPublishedDesign(t, designer);
      const viewer = await registerVerified(t);
      const res = await t.http.get(`${API}/atelier/designs/${published.id}`).set(viewer.auth).expect(200);
      expect(res.body.data.id).toBe(published.id);
      expect(res.body.data.parameters.metal).toEqual(VALID_RING_PARAMETERS.metal);
      // The owner is who a jeweler opens the conversation with; acceptance data stays internal.
      expect(res.body.data.ownerUserId).toBe(designer.id);
      expect(res.body.data).not.toHaveProperty('acceptedQuoteId');

      await t.prisma.design.update({ where: { id: published.id }, data: { status: 'DRAFT' } });
      await t.http.get(`${API}/atelier/designs/${published.id}`).set(viewer.auth).expect(404);
    });

    it('an expired listing leaves the marketplace and takes no new requests or quotes', async () => {
      const s = await requestedFromTwo();
      await t.prisma.design.update({ where: { id: s.design.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

      const feed = await t.http.get(`${API}/atelier/designs`).set(s.first.auth).expect(200);
      expect((feed.body.data.items as Array<{ id: string }>).map((d) => d.id)).not.toContain(s.design.id);
      await t.http.get(`${API}/atelier/designs/${s.design.id}`).set(s.first.auth).expect(404);
      const third = await createPublishedJeweler(t);
      const again = await t.http
        .post(`${API}/atelier/requests`)
        .set(s.designer.auth)
        .send({ designId: s.design.id, mode: 'TARGETED', targetJewelerProfileIds: [third.profileId] })
        .expect(409);
      expect(again.body.code).toBe('DESIGN_EXPIRED');
      const late = await t.http
        .post(`${API}/quotes`)
        .set(s.first.auth)
        .send({ conversationId: s.firstChat.id, designId: s.design.id, designRequestId: s.requestId, materialsCost: 100, laborCost: 50, etaBusinessDays: 10 })
        .expect(409);
      expect(late.body.code).toBe('DESIGN_EXPIRED');
    });
  });
});
