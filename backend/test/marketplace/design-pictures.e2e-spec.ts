import { API, createTestApp, TestApp } from '../utils/test-app';
import { PNG_BYTES, uploadFile } from '../utils/files';
import {
  createPublishedJeweler,
  createQuote,
  marketplaceScenario,
  TestUser,
  VALID_RING_PARAMETERS,
} from '../utils/factories';

const SIGNED = /^\/uploads\/[0-9a-f-]+\/content\?exp=\d+&sig=[0-9a-f]{64}$/;

/**
 * QA: every design was pictured with a stock photo of another ring, the jewelers never saw the
 * inspiration picture they price, and every chat showed a stranger's photo. Design payloads carry
 * a signed picture of that exact design (`previewUrl`), the jeweler's design views the signed
 * inspiration picture (`inspirationUrl`), and chat participants their business name, logo and
 * avatar links.
 */
describe('design pictures and chat identities', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function image(owner: TestUser): Promise<string> {
    const res = await uploadFile(t, owner, PNG_BYTES, 'image/png', 'picture.png').expect(201);
    return res.body.data.id as string;
  }

  /** The renderer's picture of the design (stored by the designs module). */
  async function withPreview(designId: string, owner: TestUser): Promise<string> {
    const previewUploadId = await image(owner);
    await t.prisma.design.update({ where: { id: designId }, data: { previewUploadId } });
    return previewUploadId;
  }

  async function withInspiration(designId: string, inspirationUploadId: string): Promise<void> {
    await t.prisma.design.update({
      where: { id: designId },
      data: { parameters: { ...VALID_RING_PARAMETERS, inspirationUploadId } },
    });
  }

  function signedFor(url: unknown, uploadId: string) {
    expect(url).toEqual(expect.stringMatching(SIGNED));
    expect(url as string).toContain(`/uploads/${uploadId}/content`);
  }

  async function servesPicture(url: string): Promise<void> {
    const res = await t.http.get(`${API}${url}`).expect(200);
    expect(res.headers['content-type']).toContain('image/png');
  }

  describe('the atelier (public listings)', () => {
    it('lists and shows a design with a signed picture of it, never the raw preview upload id', async () => {
      const s = await marketplaceScenario(t);
      const previewUploadId = await withPreview(s.design.id, s.designer);

      const list = await t.http.get(`${API}/atelier/designs`).expect(200);
      const row = (list.body.data.items as Array<Record<string, unknown>>).find((item) => item.id === s.design.id);
      signedFor(row?.previewUrl, previewUploadId);
      expect(row).not.toHaveProperty('previewUploadId');
      await servesPicture(row?.previewUrl as string);

      const detail = await t.http.get(`${API}/atelier/designs/${s.design.id}`).expect(200);
      signedFor(detail.body.data.previewUrl, previewUploadId);
      expect(detail.body.data).not.toHaveProperty('previewUploadId');
    });

    it('a design without a rendered picture says so (null), so the app shows its category art', async () => {
      const s = await marketplaceScenario(t);
      const detail = await t.http.get(`${API}/atelier/designs/${s.design.id}`).expect(200);
      expect(detail.body.data.previewUrl).toBeNull();
      expect(detail.body.data.inspirationUrl).toBeNull();
    });

    it('the design page shows the inspiration picture the designer briefed with', async () => {
      const s = await marketplaceScenario(t);
      const inspirationUploadId = await image(s.designer);
      await withInspiration(s.design.id, inspirationUploadId);

      const detail = await t.http.get(`${API}/atelier/designs/${s.design.id}`).expect(200);
      signedFor(detail.body.data.inspirationUrl, inspirationUploadId);
      await servesPicture(detail.body.data.inspirationUrl);
    });

    it("an inspiration id naming someone else's private file is never signed", async () => {
      const s = await marketplaceScenario(t);
      // E.g. a picture the jeweler sent privately in a chat: the designer cannot republish it.
      const foreign = await image(s.jeweler);
      await withInspiration(s.design.id, foreign);
      const detail = await t.http.get(`${API}/atelier/designs/${s.design.id}`).expect(200);
      expect(detail.body.data.inspirationUrl).toBeNull();

      await withInspiration(s.design.id, 'not-an-upload-id');
      const malformed = await t.http.get(`${API}/atelier/designs/${s.design.id}`).expect(200);
      expect(malformed.body.data.inspirationUrl).toBeNull();
    });
  });

  describe("the jeweler's orders", () => {
    async function requested() {
      const s = await marketplaceScenario(t);
      const previewUploadId = await withPreview(s.design.id, s.designer);
      const inspirationUploadId = await image(s.designer);
      await withInspiration(s.design.id, inspirationUploadId);
      const request = await t.http
        .post(`${API}/atelier/requests`)
        .set(s.designer.auth)
        .send({ designId: s.design.id, mode: 'TARGETED', targetJewelerProfileIds: [s.jeweler.profileId] })
        .expect(201);
      return { ...s, requestId: request.body.data.id as string, previewUploadId, inspirationUploadId };
    }

    it('the orders board pictures each design', async () => {
      const s = await requested();
      const res = await t.http.get(`${API}/jeweler-profiles/me/orders`).set(s.jeweler.auth).expect(200);
      const order = (res.body.data.items as Array<{ id: string; design: Record<string, unknown> }>).find(
        (item) => item.id === s.requestId,
      );
      signedFor(order?.design.previewUrl, s.previewUploadId);
      expect(order?.design).not.toHaveProperty('previewUploadId');
    });

    it('the order page shows the design picture and the inspiration picture to the jeweler', async () => {
      const s = await requested();
      const res = await t.http.get(`${API}/atelier/requests/${s.requestId}`).set(s.jeweler.auth).expect(200);
      signedFor(res.body.data.design.previewUrl, s.previewUploadId);
      signedFor(res.body.data.design.inspirationUrl, s.inspirationUploadId);
      await servesPicture(res.body.data.design.inspirationUrl);
    });
  });

  describe('quotes and chats', () => {
    it('a quote and its chat card picture the design they price', async () => {
      const s = await marketplaceScenario(t);
      const previewUploadId = await withPreview(s.design.id, s.designer);
      const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);

      const shown = await t.http.get(`${API}/quotes/${quote.id}`).set(s.designer.auth).expect(200);
      signedFor(shown.body.data.design.previewUrl, previewUploadId);
      expect(shown.body.data.design).not.toHaveProperty('previewUploadId');

      const messages = await t.http.get(`${API}/conversations/${s.conversation.id}/messages`).set(s.designer.auth).expect(200);
      const card = (messages.body.data.items as Array<{ type: string; quote?: { design?: Record<string, unknown> } }>).find(
        (m) => m.type === 'QUOTE_CARD',
      );
      signedFor(card?.quote?.design?.previewUrl, previewUploadId);

      const inbox = await t.http.get(`${API}/conversations`).set(s.designer.auth).expect(200);
      const row = (inbox.body.data.items as Array<{ id: string; design: Record<string, unknown> }>).find(
        (c) => c.id === s.conversation.id,
      );
      signedFor(row?.design.previewUrl, previewUploadId);
    });

    it('the jeweler appears under the business name and logo; the designer under their own name', async () => {
      const s = await marketplaceScenario(t);
      await t.prisma.jewelerProfile.update({ where: { id: s.jeweler.profileId }, data: { businessName: 'QA Goldsmith' } });
      const logoUploadId = await image(s.jeweler);
      await t.prisma.jewelerProfile.update({ where: { id: s.jeweler.profileId }, data: { logoUploadId } });
      await t.http
        .post(`${API}/conversations/${s.conversation.id}/messages`)
        .set(s.jeweler.auth)
        .send({ type: 'TEXT', body: 'שלום' })
        .expect(201);

      type Person = { id: string; firstName: string | null; businessName: string | null; logoUrl: string | null; avatarUrl: string | null };
      const inbox = await t.http.get(`${API}/conversations`).set(s.designer.auth).expect(200);
      const row = (inbox.body.data.items as Array<{ id: string; participants: Array<{ userId: string; user: Person }> }>).find(
        (c) => c.id === s.conversation.id,
      );
      const jewelerSide = row?.participants.find((p) => p.userId === s.jeweler.id)?.user;
      const designerSide = row?.participants.find((p) => p.userId === s.designer.id)?.user;
      expect(jewelerSide?.businessName).toBe('QA Goldsmith');
      signedFor(jewelerSide?.logoUrl, logoUploadId);
      await servesPicture(jewelerSide?.logoUrl as string);
      expect(jewelerSide?.avatarUrl).toBeNull();
      expect(jewelerSide).not.toHaveProperty('jewelerProfile');
      expect(designerSide?.businessName).toBeNull();
      expect(designerSide?.logoUrl).toBeNull();

      const one = await t.http.get(`${API}/conversations/${s.conversation.id}`).set(s.jeweler.auth).expect(200);
      const again = (one.body.data.participants as Array<{ userId: string; user: Person }>).find((p) => p.userId === s.jeweler.id);
      expect(again?.user.businessName).toBe('QA Goldsmith');

      const messages = await t.http.get(`${API}/conversations/${s.conversation.id}/messages`).set(s.designer.auth).expect(200);
      const text = (messages.body.data.items as Array<{ type: string; sender: Person | null }>).find((m) => m.type === 'TEXT');
      expect(text?.sender?.businessName).toBe('QA Goldsmith');
      signedFor(text?.sender?.logoUrl, logoUploadId);
    });

    it("a user's own photo is offered as a signed link", async () => {
      const s = await marketplaceScenario(t);
      const avatar = await image(s.designer);
      await t.http.patch(`${API}/users/me`).set(s.designer.auth).send({ avatarUploadId: avatar }).expect(200);
      const inbox = await t.http.get(`${API}/conversations`).set(s.jeweler.auth).expect(200);
      const row = (inbox.body.data.items as Array<{ id: string; participants: Array<{ userId: string; user: { avatarUrl: string | null } }> }>).find(
        (c) => c.id === s.conversation.id,
      );
      signedFor(row?.participants.find((p) => p.userId === s.designer.id)?.user.avatarUrl, avatar);
    });

    it('a second jeweler talking about the same design keeps their own business name', async () => {
      const s = await marketplaceScenario(t);
      const other = await createPublishedJeweler(t, { businessName: 'Second Bench' });
      const res = await t.http
        .post(`${API}/conversations`)
        .set(other.auth)
        .send({ designId: s.design.id, participantUserIds: [s.designer.id] })
        .expect(201);
      const peer = (res.body.data.participants as Array<{ userId: string; user: { businessName: string | null } }>).find(
        (p) => p.userId === other.id,
      );
      expect(peer?.user.businessName).toBe('Second Bench');
    });
  });
});
