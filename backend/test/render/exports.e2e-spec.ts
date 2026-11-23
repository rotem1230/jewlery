import { decodePng } from '../../src/jewelry/png';
import { DesignPreviewService } from '../../src/designs/design-preview.service';
import { JewelryRenderService } from '../../src/jewelry/jewelry-render.service';
import { RenderJobsService } from '../../src/render-jobs/render-jobs.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { TestUser, VALID_RING_PARAMETERS, createDraftDesign, registerVerified } from '../utils/factories';

/**
 * STL triangles, the extent of all vertices along each axis, and the band's width (Z extent of
 * the lower half of the ring, where nothing but the band is).
 */
function readStl(bytes: Buffer): { triangles: number; extent: [number, number, number]; bandWidth: number } {
  const triangles = bytes.readUInt32LE(80);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let bandMin = Infinity;
  let bandMax = -Infinity;
  for (let t = 0; t < triangles; t++) {
    for (let v = 0; v < 3; v++) {
      const at = 84 + t * 50 + 12 + v * 12;
      const point = [bytes.readFloatLE(at), bytes.readFloatLE(at + 4), bytes.readFloatLE(at + 8)];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], point[k]);
        max[k] = Math.max(max[k], point[k]);
      }
      if (point[1] < 0) {
        bandMin = Math.min(bandMin, point[2]);
        bandMax = Math.max(bandMax, point[2]);
      }
    }
  }
  return { triangles, extent: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], bandWidth: bandMax - bandMin };
}

async function download(t: TestApp, user: TestUser, uploadId: string): Promise<Buffer> {
  const res = await t.http
    .get(`${API}/uploads/${uploadId}/content`)
    .set(user.auth)
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (c: Buffer) => chunks.push(c));
      response.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return res.body as Buffer;
}

async function waitForJob(t: TestApp, user: TestUser, id: string) {
  for (let i = 0; i < 200; i++) {
    const res = await t.http.get(`${API}/render-jobs/${id}`).set(user.auth).expect(200);
    if (!['QUEUED', 'RUNNING'].includes(res.body.data.status)) return res.body.data;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('render job did not finish');
}

describe('Exports are made from the design itself', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('STL: a real mesh in millimetres sized by the ring size and band width', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const job = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
    expect(job.body.data.status).toBe('SUCCEEDED');
    const stl = readStl(await download(t, user, job.body.data.outputUploadId));
    expect(stl.triangles).toBeGreaterThan(1000);
    // US 7.00 → 17.19 mm inner diameter (size chart) + 2 × 1.76 mm band = 20.7 mm across.
    expect(stl.extent[0]).toBeCloseTo(20.7, 0);
    expect(stl.bandWidth).toBeCloseTo(3, 1);

    // Editing the design changes the next export.
    const current = await t.http.get(`${API}/designs/${design.id}`).set(user.auth).expect(200);
    await t.http
      .patch(`${API}/designs/${design.id}`)
      .set(user.auth)
      .send({
        version: current.body.data.version,
        parameters: {
          ...VALID_RING_PARAMETERS,
          size: { ...VALID_RING_PARAMETERS.size, bandWidthMm: 6 },
          stones: [{ stoneCode: 'SAPPHIRE' }],
          setting: { settingCode: '6_PRONG' },
        },
      })
      .expect(200);
    const again = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
    const edited = readStl(await download(t, user, again.body.data.outputUploadId));
    expect(edited.bandWidth).toBeCloseTo(6, 1);
    // The stone stands over the band: its head sits on the band (the client's notes of 23.11), not high above it.
    expect(edited.extent[1]).toBeGreaterThan(stl.extent[1] + 2);
    expect(edited.triangles).toBeGreaterThan(stl.triangles);
  });

  it('a design cannot carry more stones or elements than a piece is built with', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const stones = Array.from({ length: 13 }, () => ({ stoneCode: 'DIAMOND' }));
    const res = await t.http
      .patch(`${API}/designs/${design.id}`)
      .set(user.auth)
      .send({ version: 1, parameters: { ...VALID_RING_PARAMETERS, stones } })
      .expect(400);
    expect(JSON.stringify(res.body.errors)).toContain('at most 12');
    const elements = Array.from({ length: 7 }, () => ({ elementCode: 'STAR' }));
    await t.http
      .patch(`${API}/designs/${design.id}`)
      .set(user.auth)
      .send({ version: 1, parameters: { ...VALID_RING_PARAMETERS, elements } })
      .expect(400);
  });

  it('a request without a format exports STL; OBJ works; STEP is refused before any job is made', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const plain = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id }).expect(201);
    expect(plain.body.data.exportFormat).toBe('STL');
    const obj = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'OBJ' }).expect(201);
    const text = (await download(t, user, obj.body.data.outputUploadId)).toString('utf8');
    expect(text.split('\n').filter((l) => l.startsWith('f ')).length).toBeGreaterThan(1000);
    const step = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STEP' }).expect(400);
    expect(step.body.code).toBe('EXPORT_FORMAT_UNSUPPORTED');
    expect(await t.prisma.renderJob.count({ where: { designId: design.id } })).toBe(2);
  });

  it('HD picture (Pro): a rendered 1600 px PNG of this design, not a stock photo', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_PREMIUM_QUARTERLY' }).expect(201);
    const design = await createDraftDesign(t, user);
    const job = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'PNG_HD' }).expect(201);
    const done = job.body.data.status === 'SUCCEEDED' ? job.body.data : await waitForJob(t, user, job.body.data.id);
    expect(done.status).toBe('SUCCEEDED');
    const image = decodePng(await download(t, user, done.outputUploadId));
    expect(image.width).toBe(1600);
    expect(image.height).toBe(1600);
    // The ring is in the middle of the picture (yellow gold over a pale backdrop).
    let warm = 0;
    for (let i = 0; i < image.data.length; i += 4 * 97) if (image.data[i] - image.data[i + 2] > 50) warm++;
    expect(warm).toBeGreaterThan(50);
  });

  it('a long export answers RUNNING and finishes in the background', async () => {
    const slow = await createTestApp({ env: { RENDER_SYNC_WAIT_MS: '0' } });
    try {
      const user = await registerVerified(slow);
      const design = await createDraftDesign(slow, user);
      const job = await slow.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
      expect(['QUEUED', 'RUNNING']).toContain(job.body.data.status);
      const done = await waitForJob(slow, user, job.body.data.id);
      expect(done.status).toBe('SUCCEEDED');
      expect(done.outputUrl).toContain('/uploads/');
    } finally {
      await slow.close();
    }
  });

  it('one export at a time per owner: a second request while one runs is refused', async () => {
    const slow = await createTestApp({ env: { RENDER_SYNC_WAIT_MS: '0' } });
    try {
      const user = await registerVerified(slow);
      await slow.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_PREMIUM_QUARTERLY' }).expect(201);
      const design = await createDraftDesign(slow, user);
      const first = await slow.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'PNG_HD' }).expect(201);
      const second = await slow.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(409);
      expect(second.body.code).toBe('RENDER_IN_PROGRESS');
      expect((await waitForJob(slow, user, first.body.data.id)).status).toBe('SUCCEEDED');
      await slow.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
    } finally {
      await slow.close();
    }
  });

  it('cancelling a finished export is refused and the file stays', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const job = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
    expect(job.body.data.status).toBe('SUCCEEDED');
    await t.http.post(`${API}/render-jobs/${job.body.data.id}/cancel`).set(user.auth).expect(400);
    const after = await t.prisma.renderJob.findUniqueOrThrow({ where: { id: job.body.data.id } });
    expect(after.status).toBe('SUCCEEDED');
    expect(after.outputUploadId).toBe(job.body.data.outputUploadId);
  });

  it('a job cancelled while it renders stays cancelled and its file is withdrawn', async () => {
    const slow = await createTestApp({ env: { RENDER_SYNC_WAIT_MS: '0' } });
    try {
      const user = await registerVerified(slow);
      await slow.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_PREMIUM_QUARTERLY' }).expect(201);
      const design = await createDraftDesign(slow, user);
      const job = await slow.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'PNG_HD' }).expect(201);
      await slow.http.post(`${API}/render-jobs/${job.body.data.id}/cancel`).set(user.auth).expect(201);
      // Let the render finish behind the cancellation.
      for (let i = 0; i < 300; i++) {
        const generated = await slow.prisma.upload.count({ where: { ownerUserId: user.id, mimeType: 'image/png' } });
        if (generated > 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 300));
      const final = await slow.prisma.renderJob.findUniqueOrThrow({ where: { id: job.body.data.id } });
      expect(final.status).toBe('CANCELLED');
      expect(final.outputUploadId).toBeNull();
      const leftovers = await slow.prisma.upload.count({ where: { ownerUserId: user.id, mimeType: 'image/png', deletedAt: null } });
      expect(leftovers).toBe(0);
    } finally {
      await slow.close();
    }
  });

  it('export files are deleted a week after the export', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const job = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
    const fresh = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'OBJ' }).expect(201);
    await t.prisma.renderJob.update({ where: { id: job.body.data.id }, data: { finishedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } });
    await t.app.get(RenderJobsService).purgeOldOutputs();
    const old = await t.prisma.upload.findUniqueOrThrow({ where: { id: job.body.data.outputUploadId } });
    expect(old.deletedAt).not.toBeNull();
    expect((await t.prisma.renderJob.findUniqueOrThrow({ where: { id: job.body.data.id } })).outputUploadId).toBeNull();
    const kept = await t.prisma.upload.findUniqueOrThrow({ where: { id: fresh.body.data.outputUploadId } });
    expect(kept.deletedAt).toBeNull();
  });

  it('jobs left unfinished by a restart are failed by the sweep', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const version = await t.prisma.designVersion.findFirstOrThrow({ where: { designId: design.id } });
    const lost = await t.prisma.renderJob.create({
      data: { designId: design.id, designVersionId: version.id, status: 'RUNNING', exportFormat: 'STL', createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    const fresh = await t.prisma.renderJob.create({
      data: { designId: design.id, designVersionId: version.id, status: 'RUNNING', exportFormat: 'STL' },
    });
    await t.app.get(RenderJobsService).failStaleJobs();
    expect((await t.prisma.renderJob.findUniqueOrThrow({ where: { id: lost.id } })).status).toBe('FAILED');
    expect((await t.prisma.renderJob.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('RUNNING');
  });
});

describe('Design pictures (previews)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { DESIGN_PREVIEWS: 'on' } });
  });

  afterAll(async () => {
    await t.close();
  });

  async function waitForPreview(designId: string, version: number) {
    for (let i = 0; i < 200; i++) {
      const row = await t.prisma.design.findUniqueOrThrow({ where: { id: designId } });
      if (row.previewUploadId && row.previewVersion === version) return row;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('preview was not rendered');
  }

  it('a saved design gets a rendered picture; editing it replaces the picture', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const first = await waitForPreview(design.id, 1);
    const before = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });

    const list = await t.http.get(`${API}/designs`).set(user.auth).expect(200);
    const listed = (list.body.data.items as Array<{ id: string; previewUrl: string | null }>).find((d) => d.id === design.id);
    expect(listed?.previewUrl).toContain(`/uploads/${first.previewUploadId}/content`);
    const detail = await t.http.get(`${API}/designs/${design.id}`).set(user.auth).expect(200);
    expect(detail.body.data.previewUrl).toContain(`/uploads/${first.previewUploadId}/content`);
    const picture = decodePng(await download(t, user, first.previewUploadId!));
    expect(picture.width).toBe(640);
    // Attaching the picture is not an edit.
    expect(before.updatedAt.getTime()).toBe(first.updatedAt.getTime());
    expect(before.version).toBe(1);

    await t.http
      .patch(`${API}/designs/${design.id}`)
      .set(user.auth)
      .send({ version: 1, parameters: { ...VALID_RING_PARAMETERS, metal: { metalCode: 'ROSE_GOLD', purityCode: '18K' } } })
      .expect(200);
    const second = await waitForPreview(design.id, 2);
    expect(second.previewUploadId).not.toBe(first.previewUploadId);
    // The replaced picture is withdrawn right after the new one is attached.
    let old = await t.prisma.upload.findUniqueOrThrow({ where: { id: first.previewUploadId! } });
    for (let i = 0; i < 50 && !old.deletedAt; i++) {
      await new Promise((r) => setTimeout(r, 100));
      old = await t.prisma.upload.findUniqueOrThrow({ where: { id: first.previewUploadId! } });
    }
    expect(old.deletedAt).not.toBeNull();
  });

  it('an edit that does not change the piece keeps its picture (no new render)', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const first = await waitForPreview(design.id, 1);
    await t.http.patch(`${API}/designs/${design.id}`).set(user.auth).send({ version: 1, title: 'Renamed' }).expect(200);
    await t.app.get(DesignPreviewService).refresh(design.id);
    const after = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    expect(after.version).toBe(2);
    expect(after.previewVersion).toBe(2);
    expect(after.previewUploadId).toBe(first.previewUploadId);
  });

  it('a design whose picture cannot be rendered does not hold the sweep back', async () => {
    const service = t.app.get(DesignPreviewService);
    const user = await registerVerified(t);
    const broken = await createDraftDesign(t, user);
    const fine = await createDraftDesign(t, user);
    await waitForPreview(broken.id, 1);
    await waitForPreview(fine.id, 1);
    // Both stale and newest; the first one's render fails.
    await t.prisma.$executeRawUnsafe(
      `UPDATE "designs" SET "previewUploadId" = NULL, "previewVersion" = NULL, "updatedAt" = now() + interval '2 day' WHERE "id" = '${broken.id}'`,
    );
    await t.prisma.$executeRawUnsafe(
      `UPDATE "designs" SET "previewUploadId" = NULL, "previewVersion" = NULL, "updatedAt" = now() + interval '1 day' WHERE "id" = '${fine.id}'`,
    );
    const jewelry = t.app.get(JewelryRenderService);
    const picture = jest.spyOn(jewelry, 'picture').mockRejectedValueOnce(new Error('render failed'));
    expect(await service.backfill(1)).toBe(0);
    picture.mockRestore();
    // The failed design is skipped now; the next stale design is rendered.
    expect(await service.backfill(1)).toBe(1);
    expect((await t.prisma.design.findUniqueOrThrow({ where: { id: fine.id } })).previewUploadId).not.toBeNull();
    expect((await t.prisma.design.findUniqueOrThrow({ where: { id: broken.id } })).previewUploadId).toBeNull();
  });

  it('the sweep renders designs that have no picture (saved before previews existed)', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    await waitForPreview(design.id, 1);
    // Picture gone (as for designs saved before previews existed); the sweep takes the most
    // recently updated stale designs first, and the shared test database holds many others.
    await t.prisma.$executeRawUnsafe(
      `UPDATE "designs" SET "previewUploadId" = NULL, "previewVersion" = NULL, "updatedAt" = now() + interval '1 day' WHERE "id" = '${design.id}'`,
    );
    expect(await t.app.get(DesignPreviewService).backfill(1)).toBe(1);
    const row = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    expect(row.previewUploadId).not.toBeNull();
    expect(row.previewVersion).toBe(row.version);
  });
});
