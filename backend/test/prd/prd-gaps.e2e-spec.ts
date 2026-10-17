import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { ChatGateway } from '../../src/chat/chat.gateway';
import { QuotesService } from '../../src/quotes/quotes.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { PNG_BYTES, uploadFile } from '../utils/files';
import {
  acceptQuote,
  createDraftDesign,
  createQuote,
  itemTypeId,
  marketplaceScenario,
  registerVerified,
  VALID_RING_PARAMETERS,
} from '../utils/factories';

/** PRD gap closure (docs/prd-gap-audit.md): behaviour the PRD asks for that was missing or wrong. */
describe('PRD gaps', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('ring sizes (PRD 5.4: IL 52–64 with their US sizes and diameters)', () => {
    type Row = { standard: string; sizeCode: string; diameterMinMm: string | null; diameterMaxMm: string | null };

    it('the ring chart lists the PRD sizes, from IL 52 / US 6.00 to IL 64 / US 10.75', async () => {
      const res = await t.http.get(`${API}/wizard/size-charts/RING`).expect(200);
      const rows = res.body.data as Row[];
      const codes = (standard: string) => rows.filter((row) => row.standard === standard).map((row) => row.sizeCode);
      expect(codes('IL')).toEqual(['52', '54', '56', '58', '60', '62', '64']);
      expect(codes('US')).toEqual(['6.00', '7.00', '7.75', '8.50', '9.25', '10.00', '10.75']);
      const il52 = rows.find((row) => row.standard === 'IL' && row.sizeCode === '52');
      const il64 = rows.find((row) => row.standard === 'IL' && row.sizeCode === '64');
      expect([Number(il52?.diameterMinMm), Number(il52?.diameterMaxMm)]).toEqual([16.55, 16.95]);
      expect([Number(il64?.diameterMinMm), Number(il64?.diameterMaxMm)]).toEqual([20.4, 20.44]);
    });
  });

  describe('quotes as the designer sees them (PRD 5.6)', () => {
    it('a quote card sent live carries the real quote, not just a reference', async () => {
      const s = await marketplaceScenario(t);
      const gateway = t.app.get(ChatGateway);
      const emitted: Array<{ event: string; payload: { type?: string; quote?: { totalPrice?: unknown }; sender?: { businessName?: string | null } } }> = [];
      const spy = jest.spyOn(gateway, 'emitToConversation').mockImplementation((_id, event, payload) => {
        emitted.push({ event, payload: payload as never });
      });
      try {
        await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
      } finally {
        spy.mockRestore();
      }
      const card = emitted.find((e) => e.event === 'message:new' && e.payload.type === 'QUOTE_CARD');
      expect(Number(card?.payload.quote?.totalPrice)).toBe(150);
      // The live card shows the jeweler the way the chat does: by business name.
      expect(card?.payload.sender?.businessName).toBeTruthy();
    });

    it('the full quote names the item type and the design specification', async () => {
      const s = await marketplaceScenario(t);
      const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
      const res = await t.http.get(`${API}/quotes/${quote.id}`).set(s.designer.auth).expect(200);
      expect(res.body.data.design.itemType.code).toBe('RING');
      expect(res.body.data.design.parameters.metal).toEqual(VALID_RING_PARAMETERS.metal);
    });

    it('accepting posts the PRD system message in Hebrew and a WhatsApp link to continue directly', async () => {
      const s = await marketplaceScenario(t);
      const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
      await acceptQuote(t, s.designer, quote).expect(201);
      const messages = await t.prisma.message.findMany({
        where: { conversationId: s.conversation.id, type: 'SYSTEM' },
        orderBy: { createdAt: 'asc' },
      });
      const text = messages.map((m) => m.body).join('\n');
      expect(text).toContain('ההצעה אושרה בהצלחה');
      expect(text).toMatch(/https:\/\/wa\.me\/972501234567/);
      const handoff = messages.find((m) => (m.payload as { eventKey?: string } | null)?.eventKey === 'handoff.created');
      expect((handoff?.payload as { whatsappUrl?: string }).whatsappUrl).toBe('https://wa.me/972501234567');
      // The contact handoff is on the record (PRD 5.6), without copying the phone number into it.
      const logged = await t.prisma.eventLog.findFirst({ where: { eventKey: 'handoff.created', entityId: quote.id } });
      expect(logged?.payload).toMatchObject({ channel: 'whatsapp', messageId: handoff?.id });
      expect(JSON.stringify(logged?.payload)).not.toContain('972501234567');
    });

    it("a completed design still names its maker after the jeweler's account is deleted", async () => {
      const s = await marketplaceScenario(t);
      const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
      await acceptQuote(t, s.designer, quote).expect(201);
      await t.http.delete(`${API}/users/me`).set(s.jeweler.auth).expect(200);
      const res = await t.http.get(`${API}/designs/${s.design.id}`).set(s.designer.auth).expect(200);
      expect(res.body.data.completedBy.name).toEqual(expect.any(String));
    });

    it('the designer lists every quote a design received, with its status', async () => {
      const s = await marketplaceScenario(t);
      const first = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
      await t.http.post(`${API}/conversations/${s.conversation.id}/messages`).set(s.designer.auth).send({ type: 'TEXT', body: 'thanks' }).expect(201);
      const res = await t.http.get(`${API}/designs/${s.design.id}/quotes`).set(s.designer.auth).expect(200);
      const items = res.body.data as Array<{ id: string; status: string; totalPrice: string; author: { businessName: string | null } }>;
      expect(items.map((q) => q.id)).toEqual([first.id]);
      expect(items[0].status).toBe('PENDING');
      expect(items[0].author.businessName).toBe('Test Atelier');
      await t.http.get(`${API}/designs/${s.design.id}/quotes`).set(s.jeweler.auth).expect(403);
    });

    it('a pending quote past its validity becomes EXPIRED', async () => {
      const s = await marketplaceScenario(t);
      const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
      await t.prisma.quote.update({ where: { id: quote.id }, data: { validUntil: new Date(Date.now() - 60_000) } });
      const fresh = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
      await t.app.get(QuotesService).expireStale();
      expect((await t.prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe('EXPIRED');
      expect((await t.prisma.quote.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('PENDING');
      const events = await t.prisma.quoteEvent.findMany({ where: { quoteId: quote.id, toStatus: 'EXPIRED' } });
      expect(events).toHaveLength(1);
      // An expired quote cannot be accepted.
      const late = await acceptQuote(t, s.designer, quote);
      expect(late.status).toBe(409);
    });
  });

  describe('roles (PRD 5.1: a user can be both designer and jeweler)', () => {
    it('a designer adds the jeweler role and can switch to it; ADMIN cannot be added', async () => {
      const user = await registerVerified(t);
      const res = await t.http.post(`${API}/auth/roles`).set(user.auth).send({ role: 'JEWELER' }).expect(201);
      expect([...res.body.data.user.roles].sort()).toEqual(['DESIGNER', 'JEWELER']);
      const next = { Authorization: `Bearer ${res.body.data.tokens.accessToken as string}` };
      await t.http.post(`${API}/auth/switch-role`).set(next).send({ role: 'JEWELER' }).expect(201);
      await t.http.post(`${API}/auth/roles`).set(next).send({ role: 'ADMIN' }).expect(400);
      // Adding a role the account already has changes nothing.
      const again = await t.http.post(`${API}/auth/roles`).set(next).send({ role: 'JEWELER' }).expect(201);
      expect([...again.body.data.user.roles].sort()).toEqual(['DESIGNER', 'JEWELER']);
    });
  });

  describe('home updates (PRD 5.2: a new message from a jeweler)', () => {
    it("a chat message notifies the other participant, shown in the designer's recent updates", async () => {
      const s = await marketplaceScenario(t);
      await t.http.post(`${API}/conversations/${s.conversation.id}/messages`).set(s.jeweler.auth).send({ type: 'TEXT', body: 'Hello!' }).expect(201);
      const home = await t.http.get(`${API}/home/summary`).set(s.designer.auth).expect(200);
      const keys = (home.body.data.recentNotifications as Array<{ eventKey?: string; type?: string }>).map((n) => n.eventKey ?? n.type);
      expect(keys).toContain('message.new');
      // The sender is not notified of their own message.
      const mine = await t.prisma.notification.count({ where: { userId: s.jeweler.id, eventKey: 'message.new' } });
      expect(mine).toBe(0);
      // A second message refreshes the same update instead of adding another one.
      await t.http.post(`${API}/conversations/${s.conversation.id}/messages`).set(s.jeweler.auth).send({ type: 'TEXT', body: 'Still there?' }).expect(201);
      const unread = () => t.prisma.notification.count({ where: { userId: s.designer.id, eventKey: 'message.new', readAt: null } });
      expect(await unread()).toBe(1);
      // Reading the conversation marks its update read.
      await t.http.post(`${API}/conversations/${s.conversation.id}/read`).set(s.designer.auth).expect(201);
      expect(await unread()).toBe(0);
    });
  });

  describe('locked fields (PRD 5.3: support can unlock)', () => {
    it('support unlocks a locked field so the owner can edit it again; nobody else can', async () => {
      const owner = await registerVerified(t);
      const design = await createDraftDesign(t, owner);
      await t.http.post(`${API}/designs/${design.id}/lock`).set(owner.auth).send({ fields: ['metal', 'size'], confirm: true }).expect(201);
      const changeMetal = (version: number) =>
        t.http
          .patch(`${API}/designs/${design.id}`)
          .set(owner.auth)
          .send({ version, parameters: { ...VALID_RING_PARAMETERS, metal: { metalCode: 'ROSE_GOLD', purityCode: '18K' } } });
      await changeMetal(2).expect(403);

      await t.http.post(`${API}/admin/designs/${design.id}/unlock`).set(owner.auth).send({ fields: ['metal'], reason: 'mine' }).expect(403);
      const admin = await registerVerified(t);
      await t.prisma.user.update({ where: { id: admin.id }, data: { roles: ['DESIGNER', 'ADMIN'] } });
      const unlocked = await t.http
        .post(`${API}/admin/designs/${design.id}/unlock`)
        .set(admin.auth)
        .send({ fields: ['metal'], reason: 'Customer asked support to change the metal' })
        .expect(201);
      expect(unlocked.body.data.lockedFields).toEqual(['size']);
      await changeMetal(unlocked.body.data.version).expect(200);
      const logged = await t.prisma.auditLog.findFirst({ where: { action: 'design.unlock', entityId: design.id } });
      expect(logged?.actorUserId).toBe(admin.id);
    });
  });

  describe('inbox (PRD 5.6)', () => {
    it('a conversation opens with its participants and when each last read it; outsiders are refused', async () => {
      const s = await marketplaceScenario(t);
      await t.http.post(`${API}/conversations/${s.conversation.id}/read`).set(s.jeweler.auth).expect(201);
      const res = await t.http.get(`${API}/conversations/${s.conversation.id}`).set(s.designer.auth).expect(200);
      const jeweler = (res.body.data.participants as Array<{ userId: string; lastReadAt: string | null }>).find(
        (p) => p.userId === s.jeweler.id,
      );
      expect(jeweler?.lastReadAt).toEqual(expect.any(String));
      const outsider = await registerVerified(t);
      await t.http.get(`${API}/conversations/${s.conversation.id}`).set(outsider.auth).expect(403);
      await t.http.get(`${API}/conversations/not-a-uuid`).set(s.designer.auth).expect(404);
    });

    it("the designer finds a conversation by the jeweler's business name", async () => {
      const s = await marketplaceScenario(t);
      await t.prisma.jewelerProfile.update({ where: { id: s.jeweler.profileId }, data: { businessName: 'Sapphire Lane Studio' } });
      const res = await t.http.get(`${API}/conversations`).query({ q: 'sapphire lane' }).set(s.designer.auth).expect(200);
      expect((res.body.data.items as Array<{ id: string }>).map((c) => c.id)).toEqual([s.conversation.id]);
    });
  });

  describe('marketplace listings', () => {
    it('sponsored banners expose what is shown, never the budget', async () => {
      const now = Date.now();
      await t.prisma.promotion.create({
        data: {
          entityType: 'BANNER',
          entityId: randomUUID(),
          source: 'PAID_PLACEMENT',
          placement: 'atelier_banner',
          startAt: new Date(now - 60_000),
          endAt: new Date(now + 3_600_000),
          budget: 1000,
          isActive: true,
          meta: { headline: 'מבצע', cta: 'פרטים' },
        },
      });
      const res = await t.http.get(`${API}/atelier/banners`).expect(200);
      const banners = res.body.data as Array<Record<string, unknown>>;
      expect(banners.length).toBeGreaterThan(0);
      for (const banner of banners) {
        expect(banner).not.toHaveProperty('budget');
        expect(banner.sponsored).toBe(true);
      }
    });

    it('a completed design shows the business that made it', async () => {
      const s = await marketplaceScenario(t);
      const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
      await acceptQuote(t, s.designer, quote).expect(201);
      const list = await t.http.get(`${API}/designs`).query({ status: 'COMPLETED' }).set(s.designer.auth).expect(200);
      const card = (list.body.data.items as Array<{ id: string; completedBy: { name: string } | null }>).find((d) => d.id === s.design.id);
      expect(card?.completedBy?.name).toBe('Test Atelier');
    });
  });

  describe('input checks', () => {
    it('a password whose letters are Hebrew counts as having letters', async () => {
      const email = `hebrew.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@test.local`;
      await t.http.post(`${API}/auth/register`).send({ email, password: 'שלוםעולם2026', roles: ['DESIGNER'] }).expect(201);
      const digitsOnly = await t.http
        .post(`${API}/auth/register`)
        .send({ email: `x${email}`, password: '1234567890', roles: ['DESIGNER'] })
        .expect(400);
      expect(JSON.stringify(digitsOnly.body)).toMatch(/letter/);
    });

    it('a jeweler profile phone must be an international (E.164) number', async () => {
      const jeweler = await registerVerified(t, { roles: ['JEWELER'] });
      const region = await t.prisma.region.findFirstOrThrow();
      await t.http
        .put(`${API}/jeweler-profiles/draft`)
        .set(jeweler.auth)
        .send({ regionId: region.id, payload: { businessName: 'Atelier', phone: '050-1234567' } })
        .expect(400);
    });

    it('design parameters are validated when a design is created and before it is published', async () => {
      const owner = await registerVerified(t);
      const ringType = await itemTypeId(t);
      await t.http
        .post(`${API}/designs`)
        .set(owner.auth)
        .send({ itemTypeId: ringType, title: 'Bad ring', parameters: { ...VALID_RING_PARAMETERS, size: { standard: 'US', sizeCode: '7.00', bandWidthMm: 99 } } })
        .expect(400);

      const design = await createDraftDesign(t, owner);
      await t.prisma.design.update({ where: { id: design.id }, data: { parameters: { size: { standard: 'XX' } } } });
      await t.http.post(`${API}/designs/${design.id}/transition`).set(owner.auth).send({ toStatus: 'PUBLISHED' }).expect(400);
    });
  });

  describe('paid features (PRD 5.8 / 5.10)', () => {
    it('an HD export needs the hd_export entitlement; a standard STL export does not', async () => {
      const user = await registerVerified(t);
      const design = await createDraftDesign(t, user);
      const refused = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'PNG_HD' }).expect(403);
      expect(refused.body.code).toBe('PAYWALL');
      await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
      await t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_PRO' }).expect(201);
      await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'PNG_HD' }).expect(201);
    });

    it('try-on is refused before any processing for a free designer, and while the feature is off', async () => {
      const s = await marketplaceScenario(t);
      const selfie = await uploadFile(t, s.designer, PNG_BYTES, 'image/png', 'selfie.png').expect(201);
      const body = { designId: s.design.id, inputUploadId: selfie.body.data.id };
      // Other suites share this database and may have left the flag on.
      await t.prisma.featureFlag.updateMany({ where: { key: 'phase2_visualization' }, data: { enabled: false } });
      const off = await t.http.post(`${API}/visualization/jobs`).set(s.designer.auth).send(body).expect(403);
      expect(off.body.code).toBe('FEATURE_DISABLED');
      await t.prisma.featureFlag.upsert({
        where: { key: 'phase2_visualization' },
        update: { enabled: true, rolloutPct: 100 },
        create: { key: 'phase2_visualization', enabled: true, rolloutPct: 100 },
      });
      try {
        const paywall = await t.http.post(`${API}/visualization/jobs`).set(s.designer.auth).send(body).expect(403);
        expect(paywall.body.code).toBe('PAYWALL');
        expect(await t.prisma.visualizationJob.count({ where: { requestedById: s.designer.id } })).toBe(0);
      } finally {
        await t.prisma.featureFlag.update({ where: { key: 'phase2_visualization' }, data: { enabled: false } });
      }
    });
  });

  describe('inspiration pictures (PRD 5.4: the jeweler sees what the designer attached)', () => {
    it("a listed design's inspiration and custom element pictures open for jewelers; a draft's do not", async () => {
      const designer = await registerVerified(t);
      const inspiration = (await uploadFile(t, designer, PNG_BYTES, 'image/png', 'inspiration.png').expect(201)).body.data.id as string;
      const element = (await uploadFile(t, designer, PNG_BYTES, 'image/png', 'element.png').expect(201)).body.data.id as string;
      const design = await createDraftDesign(t, designer);
      await t.http
        .patch(`${API}/designs/${design.id}`)
        .set(designer.auth)
        .send({
          version: 1,
          parameters: { ...VALID_RING_PARAMETERS, inspirationUploadId: inspiration, elements: [{ customUploadId: element }] },
        })
        .expect(200);
      const jeweler = await registerVerified(t, { roles: ['JEWELER'] });
      const open = (id: string) => t.http.get(`${API}/uploads/${id}/content`).set(jeweler.auth);

      await open(inspiration).expect(404);
      await open(element).expect(404);
      await t.http.post(`${API}/designs/${design.id}/transition`).set(designer.auth).send({ toStatus: 'PUBLISHED' }).expect(201);
      await open(inspiration).expect(200);
      await open(element).expect(200);
      // Another user's picture named in a design does not become public through it.
      const stranger = await registerVerified(t);
      const foreign = (await uploadFile(t, stranger, PNG_BYTES, 'image/png', 'foreign.png').expect(201)).body.data.id as string;
      const other = await createDraftDesign(t, designer);
      await t.prisma.design.update({
        where: { id: other.id },
        data: { status: 'PUBLISHED', parameters: { ...VALID_RING_PARAMETERS, inspirationUploadId: foreign } },
      });
      await open(foreign).expect(404);
    });
  });

  describe('account deletion (PRD 7.2 privacy)', () => {
    it("deleting the account removes the user's own files that nothing else uses", async () => {
      const user = await registerVerified(t);
      const photo = await uploadFile(t, user, PNG_BYTES, 'image/png', 'selfie.png').expect(201);
      const upload = await t.prisma.upload.findUniqueOrThrow({ where: { id: photo.body.data.id } });
      const file = join(process.cwd(), 'uploads-local', upload.objectKey.replace(/^local\//, ''));
      expect(existsSync(file)).toBe(true);

      await t.http.delete(`${API}/users/me`).set(user.auth).expect(200);

      expect((await t.prisma.upload.findUniqueOrThrow({ where: { id: upload.id } })).deletedAt).not.toBeNull();
      expect(existsSync(file)).toBe(false);
    });

    it('a user removes their own photo nothing uses (e.g. a try-on selfie that was refused); a used or foreign one stays', async () => {
      const s = await marketplaceScenario(t);
      const selfie = (await uploadFile(t, s.designer, PNG_BYTES, 'image/png', 'selfie.png').expect(201)).body.data.id as string;
      const stored = await t.prisma.upload.findUniqueOrThrow({ where: { id: selfie } });
      const file = join(process.cwd(), 'uploads-local', stored.objectKey.replace(/^local\//, ''));

      await t.http.delete(`${API}/uploads/${selfie}`).set(s.jeweler.auth).expect(404);
      await t.http.delete(`${API}/uploads/${selfie}`).set(s.designer.auth).expect(200);
      expect((await t.prisma.upload.findUniqueOrThrow({ where: { id: selfie } })).deletedAt).not.toBeNull();
      expect(existsSync(file)).toBe(false);
      await t.http.delete(`${API}/uploads/${selfie}`).set(s.designer.auth).expect(404);

      const sent = (await uploadFile(t, s.designer, PNG_BYTES, 'image/png', 'sent.png').expect(201)).body.data.id as string;
      await t.http
        .post(`${API}/conversations/${s.conversation.id}/messages`)
        .set(s.designer.auth)
        .send({ type: 'IMAGE', imageUploadId: sent })
        .expect(201);
      const inUse = await t.http.delete(`${API}/uploads/${sent}`).set(s.designer.auth).expect(409);
      expect(inUse.body.code).toBe('UPLOAD_IN_USE');
    });

    it("deleting the account also removes the pictures of the user's designs (deleted with it)", async () => {
      const user = await registerVerified(t);
      const thumbnail = (await uploadFile(t, user, PNG_BYTES, 'image/png', 'thumb.png').expect(201)).body.data.id as string;
      const inspiration = (await uploadFile(t, user, PNG_BYTES, 'image/png', 'inspiration.png').expect(201)).body.data.id as string;
      const design = await createDraftDesign(t, user);
      await t.http
        .patch(`${API}/designs/${design.id}`)
        .set(user.auth)
        .send({ version: 1, thumbnailUploadId: thumbnail, parameters: { ...VALID_RING_PARAMETERS, inspirationUploadId: inspiration } })
        .expect(200);

      await t.http.delete(`${API}/users/me`).set(user.auth).expect(200);

      for (const id of [thumbnail, inspiration]) {
        expect((await t.prisma.upload.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
      }
    });

    it('a picture already sent in a chat stays with that conversation', async () => {
      const s = await marketplaceScenario(t);
      const image = await uploadFile(t, s.jeweler, PNG_BYTES, 'image/png', 'work.png').expect(201);
      await t.http
        .post(`${API}/conversations/${s.conversation.id}/messages`)
        .set(s.jeweler.auth)
        .send({ type: 'IMAGE', imageUploadId: image.body.data.id })
        .expect(201);
      await t.http.delete(`${API}/users/me`).set(s.jeweler.auth).expect(200);
      expect((await t.prisma.upload.findUniqueOrThrow({ where: { id: image.body.data.id } })).deletedAt).toBeNull();
    });
  });
});

