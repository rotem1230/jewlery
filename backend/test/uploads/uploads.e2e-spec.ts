import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { UploadAccessService } from '../../src/uploads/upload-access.service';
import { UploadsService } from '../../src/uploads/uploads.service';
import { VisualizationService } from '../../src/visualization/visualization.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { M4A_BYTES, PNG_BYTES, uploadFile } from '../utils/files';
import {
  acceptQuote,
  createDraftDesign,
  createPublishedJeweler,
  createQuote,
  firstRegionId,
  marketplaceScenario,
  registerVerified,
} from '../utils/factories';

describe('upload content access', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function chatImage() {
    const s = await marketplaceScenario(t);
    const upload = await uploadFile(t, s.jeweler, PNG_BYTES, 'image/png', 'photo.png').expect(201);
    await t.http
      .post(`${API}/conversations/${s.conversation.id}/messages`)
      .set(s.jeweler.auth)
      .send({ type: 'IMAGE', imageUploadId: upload.body.data.id })
      .expect(201);
    return { ...s, uploadId: upload.body.data.id as string };
  }

  it('does not serve a private chat image to anonymous callers', async () => {
    const { uploadId } = await chatImage();
    await t.http.get(`${API}/uploads/${uploadId}/content`).expect(404);
  });

  it('participants get a signed URL that serves the file privately', async () => {
    const { designer, conversation } = await chatImage();
    const messages = await t.http
      .get(`${API}/conversations/${conversation.id}/messages`)
      .set(designer.auth)
      .expect(200);
    const image = (messages.body.data.items as Array<{ type: string; imageUpload?: { contentUrl?: string } }>).find(
      (m) => m.type === 'IMAGE',
    );
    expect(image?.imageUpload?.contentUrl).toMatch(/^\/uploads\/[0-9a-f-]+\/content\?exp=\d+&sig=[0-9a-f]+$/);

    const res = await t.http.get(`${API}${image?.imageUpload?.contentUrl}`).expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('a signed media URL can be embedded by the web app on another origin', async () => {
    const { uploadId } = await chatImage();
    const signed = t.app.get(UploadAccessService).signedContentPath(uploadId);
    const res = await t.http.get(`${API}${signed}`).expect(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('refuses a tampered or expired signature', async () => {
    const { uploadId } = await chatImage();
    const signer = t.app.get(UploadAccessService);
    const valid = signer.signedContentPath(uploadId);
    const tampered = valid.replace(/sig=([0-9a-f])/, (_m, c: string) => `sig=${c === 'a' ? 'b' : 'a'}`);
    await t.http.get(`${API}${tampered}`).expect(404);
    await t.http.get(`${API}${signer.signedContentPath(uploadId, -60)}`).expect(404);
  });

  it('serves to a participant bearer token but not to an outsider', async () => {
    const { designer, uploadId } = await chatImage();
    await t.http.get(`${API}/uploads/${uploadId}/content`).set(designer.auth).expect(200);
    const outsider = await registerVerified(t);
    await t.http.get(`${API}/uploads/${uploadId}/content`).set(outsider.auth).expect(404);
  });

  it("a design's thumbnail becomes public only when the design is published", async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    const thumb = await uploadFile(t, owner, PNG_BYTES, 'image/png', 'thumb.png').expect(201);
    const current = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    await t.http
      .patch(`${API}/designs/${design.id}`)
      .set(owner.auth)
      .send({ version: current.version, thumbnailUploadId: thumb.body.data.id })
      .expect(200);
    await t.http.get(`${API}/uploads/${thumb.body.data.id}/content`).expect(404);

    await t.http.post(`${API}/designs/${design.id}/transition`).set(owner.auth).send({ toStatus: 'PUBLISHED' }).expect(201);
    await t.http.get(`${API}/uploads/${thumb.body.data.id}/content`).expect(200);
  });

  it("a design's thumbnail stays public once completed and turns private when archived", async () => {
    const s = await marketplaceScenario(t);
    const thumb = await uploadFile(t, s.designer, PNG_BYTES, 'image/png', 'thumb.png').expect(201);
    const thumbId = thumb.body.data.id as string;
    const current = await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } });
    await t.http
      .patch(`${API}/designs/${s.design.id}`)
      .set(s.designer.auth)
      .send({ version: current.version, thumbnailUploadId: thumbId })
      .expect(200);

    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    await acceptQuote(t, s.designer, quote).expect(201);
    const completed = await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } });
    expect(completed.status).toBe('COMPLETED');
    await t.http.get(`${API}/uploads/${thumbId}/content`).expect(200);

    await t.http.post(`${API}/designs/${s.design.id}/transition`).set(s.designer.auth).send({ toStatus: 'ARCHIVED' }).expect(201);
    await t.http.get(`${API}/uploads/${thumbId}/content`).expect(404);
    // The owner still sees it, through a signed link.
    const own = await t.http.get(`${API}/designs/${s.design.id}`).set(s.designer.auth).expect(200);
    const thumbnailUrl = own.body.data.thumbnailUrl as string;
    expect(thumbnailUrl).toMatch(/sig=/);
    await t.http.get(`${API}${thumbnailUrl}`).expect(200);
  });

  it('the thumbnail of a removed design is no longer public', async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    const thumb = await uploadFile(t, owner, PNG_BYTES, 'image/png', 'thumb.png').expect(201);
    const current = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    await t.http
      .patch(`${API}/designs/${design.id}`)
      .set(owner.auth)
      .send({ version: current.version, thumbnailUploadId: thumb.body.data.id })
      .expect(200);
    await t.http.post(`${API}/designs/${design.id}/transition`).set(owner.auth).send({ toStatus: 'PUBLISHED' }).expect(201);
    await t.http.get(`${API}/uploads/${thumb.body.data.id}/content`).expect(200);

    await t.prisma.design.update({ where: { id: design.id }, data: { deletedAt: new Date() } });
    await t.http.get(`${API}/uploads/${thumb.body.data.id}/content`).expect(404);
  });

  it("the jeweler's own profile returns working signed links while the profile is offline", async () => {
    const jeweler = await registerVerified(t, { roles: ['JEWELER'] });
    const logo = await uploadFile(t, jeweler, PNG_BYTES, 'image/png', 'logo.png').expect(201);
    await t.http
      .put(`${API}/jeweler-profiles/draft`)
      .set(jeweler.auth)
      .send({ regionId: await firstRegionId(t), logoUploadId: logo.body.data.id, payload: { businessName: 'Atelier', phone: '+972501234567' } })
      .expect(200);
    await t.http.post(`${API}/jeweler-profiles/publish`).set(jeweler.auth).send({}).expect(201);
    const work = await uploadFile(t, jeweler, PNG_BYTES, 'image/png', 'work.png').expect(201);
    await t.http.post(`${API}/jeweler-profiles/me/portfolio`).set(jeweler.auth).send({ uploadId: work.body.data.id }).expect(201);
    await t.prisma.jewelerProfile.update({ where: { userId: jeweler.id }, data: { publishStatus: 'UNPUBLISHED' } });
    // Offline: the files are private again, reachable only through the signed links.
    await t.http.get(`${API}/uploads/${logo.body.data.id}/content`).expect(404);

    const me = await t.http.get(`${API}/jeweler-profiles/me`).set(jeweler.auth).expect(200);
    const logoUrl = me.body.data.logoUrl as string;
    expect(logoUrl).toMatch(/sig=/);
    await t.http.get(`${API}${logoUrl}`).expect(200);
    const portfolio = await t.http.get(`${API}/jeweler-profiles/me/portfolio`).set(jeweler.auth).expect(200);
    const item = (portfolio.body.data as Array<{ contentUrl: string }>)[0];
    await t.http.get(`${API}${item.contentUrl}`).expect(200);
  });

  it('a signature made for one file does not open another', async () => {
    const first = await chatImage();
    const second = await chatImage();
    const signedFirst = t.app.get(UploadAccessService).signedContentPath(first.uploadId);
    await t.http.get(`${API}${signedFirst}`).expect(200);
    await t.http.get(`${API}${signedFirst.replace(first.uploadId, second.uploadId)}`).expect(404);
  });

  it('a bearer token of a suspended account, or from sessions that were ended, opens no private media', async () => {
    const { designer, uploadId } = await chatImage();
    await t.http.get(`${API}/uploads/${uploadId}/content`).set(designer.auth).expect(200);
    await t.http.post(`${API}/auth/revoke-all`).set(designer.auth).send({}).expect(200);
    await t.http.get(`${API}/uploads/${uploadId}/content`).set(designer.auth).expect(404);

    const other = await chatImage();
    await t.prisma.user.update({ where: { id: other.designer.id }, data: { status: 'SUSPENDED' } });
    await t.http.get(`${API}/uploads/${other.uploadId}/content`).set(other.designer.auth).expect(404);
  });

  it('only a finished upload is ever served', async () => {
    const { designer, uploadId } = await chatImage();
    await t.prisma.upload.update({ where: { id: uploadId }, data: { status: 'PENDING' } });
    await t.http.get(`${API}/uploads/${uploadId}/content`).set(designer.auth).expect(404);
    await t.http.get(`${API}${t.app.get(UploadAccessService).signedContentPath(uploadId)}`).expect(404);
  });

  it('a stored path that leads out of the storage directory is never served', async () => {
    const owner = await registerVerified(t);
    const upload = await uploadFile(t, owner, PNG_BYTES, 'image/png', 'me.png').expect(201);
    await t.prisma.upload.update({ where: { id: upload.body.data.id }, data: { objectKey: 'local/../package.json' } });
    const res = await t.http.get(`${API}/uploads/${upload.body.data.id}/content`).set(owner.auth);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('"dependencies"');
  });

  it('served files are never sniffed into another type, and private ones are not cached by intermediaries', async () => {
    const { designer, uploadId } = await chatImage();
    const res = await t.http.get(`${API}/uploads/${uploadId}/content`).set(designer.auth).expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['cache-control']).toBe('private, no-store');
    // A bearer-authorized response keeps the same-origin resource policy.
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it("a legacy reference to someone else's upload neither publishes nor shares it", async () => {
    const victim = await registerVerified(t);
    const upload = await uploadFile(t, victim, PNG_BYTES, 'image/png', 'private.png').expect(201);
    const id = upload.body.data.id as string;
    // Rows written before ownership checks existed: another user's published design and chat
    // message point at the victim's private upload.
    const s = await marketplaceScenario(t);
    await t.prisma.design.update({ where: { id: s.design.id }, data: { thumbnailUploadId: id } });
    await t.prisma.message.create({
      data: { conversationId: s.conversation.id, senderId: s.designer.id, type: 'IMAGE', imageUploadId: id },
    });

    await t.http.get(`${API}/uploads/${id}/content`).expect(404);
    await t.http.get(`${API}/uploads/${id}/content`).set(s.jeweler.auth).expect(404);
    await t.http.get(`${API}/uploads/${id}/content`).set(victim.auth).expect(200);
  });

  it('never serves a deleted upload, even with a valid signature', async () => {
    const { uploadId } = await chatImage();
    const url = t.app.get(UploadAccessService).signedContentPath(uploadId);
    await t.prisma.upload.update({ where: { id: uploadId }, data: { deletedAt: new Date(), status: 'DELETED' } });
    await t.http.get(`${API}${url}`).expect(404);
  });

  it('a participant cannot attach someone else\'s upload to a chat message', async () => {
    const s = await marketplaceScenario(t);
    const outsider = await registerVerified(t);
    const foreign = await uploadFile(t, outsider, PNG_BYTES, 'image/png', 'private.png').expect(201);
    await t.http
      .post(`${API}/conversations/${s.conversation.id}/messages`)
      .set(s.jeweler.auth)
      .send({ type: 'IMAGE', imageUploadId: foreign.body.data.id })
      .expect(400);
    // and the outsider's private file stays unreachable for the conversation participants
    await t.http.get(`${API}/uploads/${foreign.body.data.id}/content`).set(s.designer.auth).expect(404);
  });

  it('keeps the logo of a published jeweler profile public', async () => {
    const jeweler = await registerVerified(t, { roles: ['JEWELER'] });
    const logo = await uploadFile(t, jeweler, PNG_BYTES, 'image/png', 'logo.png').expect(201);
    await t.http
      .put(`${API}/jeweler-profiles/draft`)
      .set(jeweler.auth)
      .send({
        regionId: await firstRegionId(t),
        logoUploadId: logo.body.data.id,
        payload: { businessName: 'Logo Atelier', phone: '+972501234567' },
      })
      .expect(200);
    await t.http.post(`${API}/jeweler-profiles/publish`).set(jeweler.auth).send({}).expect(201);

    const res = await t.http.get(`${API}/uploads/${logo.body.data.id}/content`).expect(200);
    expect(res.headers['cache-control']).toContain('public');
  });
});

describe('upload validation', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('rejects a file whose bytes do not match the declared type', async () => {
    const user = await registerVerified(t);
    const html = Buffer.from('<html><script>alert(document.cookie)</script></html>');
    const res = await uploadFile(t, user, html, 'image/png', 'evil.png').expect(400);
    expect(res.body.code).toBe('UPLOAD_CONTENT_MISMATCH');
  });

  it('accepts voice notes (audio/m4a) with the seeded upload limits', async () => {
    const user = await registerVerified(t);
    await uploadFile(t, user, M4A_BYTES, 'audio/m4a', 'voice-note.m4a').expect(201);
  });

  it('accepts one file per request', async () => {
    const user = await registerVerified(t);
    await t.http
      .post(`${API}/uploads`)
      .set(user.auth)
      .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .attach('file', PNG_BYTES, { filename: 'b.png', contentType: 'image/png' })
      .expect(400);
  });

  it('an avatar or portfolio picture must be an image of your own', async () => {
    const jeweler = await createPublishedJeweler(t);
    const voice = await uploadFile(t, jeweler, M4A_BYTES, 'audio/m4a', 'note.m4a').expect(201);
    await t.http.patch(`${API}/users/me`).set(jeweler.auth).send({ avatarUploadId: voice.body.data.id }).expect(400);
    await t.http.post(`${API}/jeweler-profiles/me/portfolio`).set(jeweler.auth).send({ uploadId: voice.body.data.id }).expect(400);

    const stranger = await registerVerified(t);
    const theirs = await uploadFile(t, stranger, PNG_BYTES, 'image/png', 'theirs.png').expect(201);
    await t.http.patch(`${API}/users/me`).set(jeweler.auth).send({ avatarUploadId: theirs.body.data.id }).expect(400);
    await t.http.post(`${API}/jeweler-profiles/me/portfolio`).set(jeweler.auth).send({ uploadId: theirs.body.data.id }).expect(400);
  });

  it('a chat message cannot present a voice note as an image, or an image as a voice note', async () => {
    const s = await marketplaceScenario(t);
    const voice = await uploadFile(t, s.jeweler, M4A_BYTES, 'audio/m4a', 'note.m4a').expect(201);
    const photo = await uploadFile(t, s.jeweler, PNG_BYTES, 'image/png', 'photo.png').expect(201);
    const send = (body: Record<string, unknown>) =>
      t.http.post(`${API}/conversations/${s.conversation.id}/messages`).set(s.jeweler.auth).send(body);
    await send({ type: 'IMAGE', imageUploadId: voice.body.data.id }).expect(400);
    await send({ type: 'AUDIO', imageUploadId: photo.body.data.id }).expect(400);
    await send({ type: 'AUDIO', imageUploadId: voice.body.data.id }).expect(201);
  });

  it('answers a request without a file with 400, not 500', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/uploads`).set(user.auth).field('note', 'no file').expect(400);
  });

  it('enforces the per-user daily upload volume', async () => {
    const before = await t.prisma.appConfig.findUniqueOrThrow({ where: { key: 'upload_limits' } });
    const limits = before.value as Record<string, unknown>;
    await t.prisma.appConfig.update({
      where: { key: 'upload_limits' },
      data: { value: { ...limits, dailyMaxBytes: PNG_BYTES.length * 2 }, version: { increment: 1 } },
    });
    try {
      const user = await registerVerified(t);
      await uploadFile(t, user, PNG_BYTES, 'image/png').expect(201);
      await uploadFile(t, user, PNG_BYTES, 'image/png').expect(201);
      const res = await uploadFile(t, user, PNG_BYTES, 'image/png').expect(429);
      expect(res.body.code).toBe('UPLOAD_QUOTA_EXCEEDED');
    } finally {
      await t.prisma.appConfig.update({
        where: { key: 'upload_limits' },
        data: { value: limits as object, version: { increment: 1 } },
      });
    }
  });

  async function withLimits(patchLimits: Record<string, unknown>, run: () => Promise<void>) {
    const before = await t.prisma.appConfig.findUniqueOrThrow({ where: { key: 'upload_limits' } });
    const limits = before.value as Record<string, unknown>;
    await t.prisma.appConfig.update({
      where: { key: 'upload_limits' },
      data: { value: { ...limits, ...patchLimits } as object, version: { increment: 1 } },
    });
    try {
      await run();
    } finally {
      await t.prisma.appConfig.update({
        where: { key: 'upload_limits' },
        data: { value: limits as object, version: { increment: 1 } },
      });
    }
  }

  it('the daily quota holds under simultaneous uploads', async () => {
    await withLimits({ dailyMaxFiles: 3 }, async () => {
      const user = await registerVerified(t);
      const results = await Promise.all(
        Array.from({ length: 12 }, () => uploadFile(t, user, PNG_BYTES, 'image/png')),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 429)).toHaveLength(9);
      expect(await t.prisma.upload.count({ where: { ownerUserId: user.id } })).toBe(3);
    });
  });

  it('a failed save leaves no orphan file on disk', async () => {
    const user = await registerVerified(t);
    const dir = join(process.cwd(), 'uploads-local');
    const filesBefore = existsSync(dir) ? readdirSync(dir).length : 0;
    await t.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_upload_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW."ownerUserId" = '${user.id}'::uuid THEN RAISE EXCEPTION 'injected upload failure'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await t.prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_upload_insert BEFORE INSERT ON "uploads"
      FOR EACH ROW EXECUTE FUNCTION test_fail_upload_insert()`);
    try {
      const res = await uploadFile(t, user, PNG_BYTES, 'image/png');
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      await t.prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_upload_insert ON "uploads"`);
      await t.prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_fail_upload_insert()`);
    }
    expect(readdirSync(dir).length).toBe(filesBefore);
  });

  it('generated outputs (exports, AI models) do not use up the personal upload quota', async () => {
    await withLimits({ dailyMaxFiles: 2 }, async () => {
      const user = await registerVerified(t);
      await t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_PRO' }).expect(201);
      const design = await createDraftDesign(t, user);
      await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'PNG_HD' }).expect(201);
      await uploadFile(t, user, PNG_BYTES, 'image/png').expect(201);
      await uploadFile(t, user, PNG_BYTES, 'image/png').expect(201);
    });
  });

  it('refuses to reference another user\'s upload as a design thumbnail or jeweler logo', async () => {
    const owner = await registerVerified(t);
    const foreign = await uploadFile(t, owner, PNG_BYTES, 'image/png').expect(201);
    const other = await registerVerified(t, { roles: ['DESIGNER', 'JEWELER'] });

    const design = await createDraftDesign(t, other);
    await t.http
      .patch(`${API}/designs/${design.id}`)
      .set(other.auth)
      .send({ version: 1, thumbnailUploadId: foreign.body.data.id })
      .expect(400);

    await t.http
      .put(`${API}/jeweler-profiles/draft`)
      .set(other.auth)
      .send({ logoUploadId: foreign.body.data.id, payload: { businessName: 'X' } })
      .expect(400);
  });
});

describe('presigned uploads in production', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { NODE_ENV: 'production' } });
  });

  afterAll(async () => {
    await t.close();
  });

  it('are disabled until a real object-storage driver exists', async () => {
    const user = await registerVerified(t);
    await t.http
      .post(`${API}/uploads/presign`)
      .set(user.auth)
      .send({ mimeType: 'image/png', sizeBytes: 100 })
      .expect(501);
  });
});

describe('visualization retention', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.prisma.featureFlag.upsert({
      where: { key: 'phase2_visualization' },
      update: { enabled: true, rolloutPct: 100 },
      create: { key: 'phase2_visualization', enabled: true, rolloutPct: 100 },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('purging deletes the stored files, stops serving them and does not repeat', async () => {
    const s = await marketplaceScenario(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(s.designer.auth).send({ planCode: 'DESIGNER_PRO' }).expect(201);
    const selfie = await uploadFile(t, s.designer, PNG_BYTES, 'image/png', 'selfie.png').expect(201);
    const job = await t.http
      .post(`${API}/visualization/jobs`)
      .set(s.designer.auth)
      .send({ designId: s.design.id, inputUploadId: selfie.body.data.id })
      .expect(201);

    await t.prisma.visualizationJob.update({
      where: { id: job.body.data.id },
      data: { retentionExpiresAt: new Date(Date.now() - 1000) },
    });
    const uploads = await t.prisma.upload.findMany({
      where: { id: { in: [selfie.body.data.id, job.body.data.outputUploadId] } },
    });
    const files = uploads.map((u) => join(process.cwd(), 'uploads-local', u.objectKey.replace(/^local\//, '')));
    expect(files.every((f) => existsSync(f))).toBe(true);

    const purge = t.app.get(VisualizationService);
    const first = await purge.purgeExpired();
    expect(first.purgedJobs).toBeGreaterThanOrEqual(1);
    expect(files.some((f) => existsSync(f))).toBe(false);
    await t.http.get(`${API}/uploads/${selfie.body.data.id}/content`).set(s.designer.auth).expect(404);

    const again = await purge.purgeExpired();
    expect(again.purgedJobs).toBe(0);
  });

  it('purging never deletes a photo that is also used elsewhere (e.g. the avatar)', async () => {
    const s = await marketplaceScenario(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(s.designer.auth).send({ planCode: 'DESIGNER_PRO' }).expect(201);
    const photo = await uploadFile(t, s.designer, PNG_BYTES, 'image/png', 'me.png').expect(201);
    await t.http.patch(`${API}/users/me`).set(s.designer.auth).send({ avatarUploadId: photo.body.data.id }).expect(200);
    const job = await t.http
      .post(`${API}/visualization/jobs`)
      .set(s.designer.auth)
      .send({ designId: s.design.id, inputUploadId: photo.body.data.id })
      .expect(201);
    await t.prisma.visualizationJob.update({
      where: { id: job.body.data.id },
      data: { retentionExpiresAt: new Date(Date.now() - 1000) },
    });

    await t.app.get(VisualizationService).purgeExpired();

    const avatar = await t.prisma.upload.findUniqueOrThrow({ where: { id: photo.body.data.id } });
    expect(avatar.deletedAt).toBeNull();
    await t.http.get(`${API}/uploads/${photo.body.data.id}/content`).expect(200);
    const output = await t.prisma.upload.findUniqueOrThrow({ where: { id: job.body.data.outputUploadId } });
    expect(output.deletedAt).not.toBeNull();
  });

  it('only a ready image of the user can be the try-on input', async () => {
    const s = await marketplaceScenario(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(s.designer.auth).send({ planCode: 'DESIGNER_PRO' }).expect(201);
    const voice = await uploadFile(t, s.designer, M4A_BYTES, 'audio/m4a', 'note.m4a').expect(201);
    await t.http
      .post(`${API}/visualization/jobs`)
      .set(s.designer.auth)
      .send({ designId: s.design.id, inputUploadId: voice.body.data.id })
      .expect(400);
  });

  it('the try-on result opens only through the signed link its owner receives', async () => {
    const s = await marketplaceScenario(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(s.designer.auth).send({ planCode: 'DESIGNER_PRO' }).expect(201);
    const selfie = await uploadFile(t, s.designer, PNG_BYTES, 'image/png', 'selfie.png').expect(201);
    const created = await t.http
      .post(`${API}/visualization/jobs`)
      .set(s.designer.auth)
      .send({ designId: s.design.id, inputUploadId: selfie.body.data.id })
      .expect(201);
    const jobId = created.body.data.id as string;
    const outputId = created.body.data.outputUploadId as string;
    expect(created.body.data.outputUrl).toMatch(/sig=/);

    const one = await t.http.get(`${API}/visualization/jobs/${jobId}`).set(s.designer.auth).expect(200);
    const outputUrl = one.body.data.outputUrl as string;
    expect(outputUrl).toContain(`/uploads/${outputId}/content?`);
    expect(outputUrl).toMatch(/sig=/);
    await t.http.get(`${API}${outputUrl}`).expect(200);
    const list = await t.http.get(`${API}/visualization/jobs`).set(s.designer.auth).expect(200);
    const listed = (list.body.data.items as Array<{ id: string; outputUrl: string }>).find((job) => job.id === jobId);
    expect(listed?.outputUrl).toMatch(/sig=/);

    // Without the link the file is private, and nobody else can read the job to get one.
    await t.http.get(`${API}/uploads/${outputId}/content`).expect(404);
    const outsider = await registerVerified(t);
    await t.http.get(`${API}/visualization/jobs/${jobId}`).set(outsider.auth).expect(403);
    await t.http.get(`${API}/uploads/${outputId}/content`).set(outsider.auth).expect(404);
  });
});

describe('public jeweler logo for unpublished profiles', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('a draft logo is private until the profile is published', async () => {
    const jeweler = await createPublishedJeweler(t);
    const draftLogo = await uploadFile(t, jeweler, PNG_BYTES, 'image/png', 'next-logo.png').expect(201);
    await t.http
      .put(`${API}/jeweler-profiles/draft`)
      .set(jeweler.auth)
      .send({ logoUploadId: draftLogo.body.data.id, payload: { businessName: 'Still draft' } })
      .expect(200);
    await t.http.get(`${API}/uploads/${draftLogo.body.data.id}/content`).expect(404);
  });
});

describe('AI model of a saved design', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('the owner gets a working signed link to the design AI model, never to someone else upload', async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    const own = await t.app.get(UploadsService).createGeneratedLocal(owner.id, PNG_BYTES, 'image/png');
    await t.prisma.design.update({ where: { id: design.id }, data: { parameters: { aiOutputUploadId: own.id } } });

    const res = await t.http.get(`${API}/designs/${design.id}`).set(owner.auth).expect(200);
    expect(res.body.data.aiOutputUrl).toMatch(/^\/uploads\/.+\/content\?exp=/);
    await t.http.get(`${API}${res.body.data.aiOutputUrl}`).expect(200);

    const victim = await registerVerified(t);
    const foreign = await uploadFile(t, victim, PNG_BYTES, 'image/png').expect(201);
    await t.prisma.design.update({
      where: { id: design.id },
      data: { parameters: { aiOutputUploadId: foreign.body.data.id } },
    });
    const forged = await t.http.get(`${API}/designs/${design.id}`).set(owner.auth).expect(200);
    expect(forged.body.data.aiOutputUrl).toBeNull();
  });
});

describe('try-on limits', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { VISUALIZATION_JOBS_PER_DAY: '2' } });
    await t.prisma.featureFlag.upsert({
      where: { key: 'phase2_visualization' },
      update: { enabled: true, rolloutPct: 100 },
      create: { key: 'phase2_visualization', enabled: true, rolloutPct: 100 },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('caps try-on jobs per user per day, also under simultaneous requests', async () => {
    const s = await marketplaceScenario(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(s.designer.auth).send({ planCode: 'DESIGNER_PRO' }).expect(201);
    const selfie = await uploadFile(t, s.designer, PNG_BYTES, 'image/png', 'selfie.png').expect(201);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        t.http
          .post(`${API}/visualization/jobs`)
          .set(s.designer.auth)
          .send({ designId: s.design.id, inputUploadId: selfie.body.data.id }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 429, 429]);
    expect(results.find((r) => r.status === 429)?.body.code).toBe('VISUALIZATION_QUOTA_EXCEEDED');
  });
});
