import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { Stream } from 'stream';
import { join } from 'path';
import { UploadsService } from '../../src/uploads/uploads.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { M4A_BYTES, PNG_BYTES, uploadFile } from '../utils/files';
import { createDraftDesign, registerVerified, TestUser } from '../utils/factories';

// The real module object (an ES namespace import cannot be spied on): the service calls through it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeFs: typeof import('fs') = require('fs');

/**
 * Regression: on hosts without a persistent disk (Render free tier) every upload lived on the
 * container disk and disappeared on each deploy while its row stayed, leaving broken images.
 * STORAGE_DRIVER=database keeps the bytes in `upload_blobs`, in the same transaction as the row.
 */

/** Collects any response body as raw bytes (supertest only buffers some types by itself). */
function binary(res: Stream, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (err) => callback(err, Buffer.alloc(0)));
}

const LOCAL_DIR = join(process.cwd(), 'uploads-local');

/** Runs `run` and reports the files it wrote under uploads-local/ (captured before the spy is reset). */
async function watchLocalWrites<T>(run: () => Promise<T>): Promise<{ result: T; localWrites: string[] }> {
  const spy = jest.spyOn(nodeFs, 'writeFileSync');
  try {
    const result = await run();
    const localWrites = spy.mock.calls.map(([path]) => String(path)).filter((path) => path.includes('uploads-local'));
    return { result, localWrites };
  } finally {
    spy.mockRestore();
  }
}

function storedName(objectKey: string): string {
  return objectKey.slice(objectKey.lastIndexOf('/') + 1);
}

/** A row written before the database driver existed: bytes on the local disk, bucket local-dev. */
async function legacyLocalUpload(t: TestApp, owner: TestUser, bytes: Buffer, mimeType: string, ext: string) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  writeFileSync(join(LOCAL_DIR, filename), bytes);
  const upload = await t.prisma.upload.create({
    data: {
      ownerUserId: owner.id,
      bucket: 'local-dev',
      objectKey: `local/${filename}`,
      mimeType,
      sizeBytes: bytes.length,
      status: 'READY',
      readyAt: new Date(),
    },
  });
  return { upload, path: join(LOCAL_DIR, filename) };
}

describe('database storage driver', () => {
  let t: TestApp;
  let uploads: UploadsService;
  const cleanup: string[] = [];

  beforeAll(async () => {
    t = await createTestApp({ env: { STORAGE_DRIVER: 'database' } });
    uploads = t.app.get(UploadsService);
  });

  afterAll(async () => {
    for (const path of cleanup) {
      rmSync(path, { force: true });
    }
    await t.close();
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

  it('stores an upload in the database, not on the container disk', async () => {
    const owner = await registerVerified(t);
    const { result: res, localWrites } = await watchLocalWrites(() =>
      uploadFile(t, owner, PNG_BYTES, 'image/png', 'photo.png').expect(201),
    );
    expect(localWrites).toEqual([]);
    expect(res.body.data.contentUrl).toMatch(/^\/uploads\/[0-9a-f-]+\/content\?exp=\d+&sig=[0-9a-f]+$/);

    const row = await t.prisma.upload.findUniqueOrThrow({ where: { id: res.body.data.id }, include: { blob: true } });
    expect(row.bucket).toBe('database');
    expect(row.objectKey).toMatch(/^db\/[0-9a-f-]{36}\.png$/);
    expect(row.status).toBe('READY');
    expect(row.sizeBytes).toBe(PNG_BYTES.length);
    expect(row.blob).not.toBeNull();
    expect(Buffer.from(row.blob!.data).equals(PNG_BYTES)).toBe(true);
    expect(existsSync(join(LOCAL_DIR, storedName(row.objectKey)))).toBe(false);
  });

  it('serves the stored bytes unchanged, with the same headers as files on disk', async () => {
    const owner = await registerVerified(t);
    const upload = await uploadFile(t, owner, PNG_BYTES, 'image/png', 'photo.png').expect(201);

    const own = await t.http
      .get(`${API}/uploads/${upload.body.data.id}/content`)
      .set(owner.auth)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((own.body as Buffer).equals(PNG_BYTES)).toBe(true);
    expect(own.headers['content-type']).toContain('image/png');
    expect(own.headers['content-length']).toBe(String(PNG_BYTES.length));
    expect(own.headers['content-disposition']).toBe('inline');
    expect(own.headers['cache-control']).toBe('private, no-store');
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect(own.headers['cross-origin-resource-policy']).toBe('same-origin');

    const signed = await t.http
      .get(`${API}${upload.body.data.contentUrl}`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((signed.body as Buffer).equals(PNG_BYTES)).toBe(true);
    expect(signed.headers['cross-origin-resource-policy']).toBe('cross-origin');

    // Still private: no anonymous access, no outsider access.
    await t.http.get(`${API}/uploads/${upload.body.data.id}/content`).expect(404);
    const outsider = await registerVerified(t);
    await t.http.get(`${API}/uploads/${upload.body.data.id}/content`).set(outsider.auth).expect(404);
  });

  it('a conditional request for unchanged content gets 304', async () => {
    const owner = await registerVerified(t);
    const upload = await uploadFile(t, owner, PNG_BYTES, 'image/png', 'photo.png').expect(201);
    const first = await t.http.get(`${API}/uploads/${upload.body.data.id}/content`).set(owner.auth).expect(200);
    expect(first.headers.etag).toBeTruthy();
    await t.http
      .get(`${API}/uploads/${upload.body.data.id}/content`)
      .set(owner.auth)
      .set('If-None-Match', first.headers.etag)
      .expect(304);
  });

  it('a row whose bytes are missing is not served', async () => {
    const owner = await registerVerified(t);
    const upload = await uploadFile(t, owner, PNG_BYTES, 'image/png', 'photo.png').expect(201);
    await t.prisma.uploadBlob.delete({ where: { uploadId: upload.body.data.id } });
    await t.http.get(`${API}/uploads/${upload.body.data.id}/content`).set(owner.auth).expect(404);
  });

  it('a failed save leaves neither a row nor bytes behind (one transaction)', async () => {
    const owner = await registerVerified(t);
    await t.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_blob_insert() RETURNS trigger AS $$
      BEGIN
        IF (SELECT "ownerUserId" FROM "uploads" WHERE "id" = NEW."uploadId") = '${owner.id}'::uuid THEN
          RAISE EXCEPTION 'injected blob failure';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await t.prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_blob_insert BEFORE INSERT ON "upload_blobs"
      FOR EACH ROW EXECUTE FUNCTION test_fail_blob_insert()`);
    try {
      const res = await uploadFile(t, owner, PNG_BYTES, 'image/png');
      expect(res.status).toBeGreaterThanOrEqual(500);
      await expect(uploads.createGeneratedLocal(owner.id, PNG_BYTES, 'image/png')).rejects.toThrow();
    } finally {
      await t.prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_blob_insert ON "upload_blobs"`);
      await t.prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_fail_blob_insert()`);
    }
    expect(await t.prisma.upload.count({ where: { ownerUserId: owner.id } })).toBe(0);
  });

  it('keeps generated outputs in the database, outside the personal upload quota', async () => {
    const owner = await registerVerified(t);
    await withLimits({ dailyMaxFiles: 1 }, async () => {
      const generated = await uploads.createGeneratedLocal(owner.id, PNG_BYTES, 'image/png');
      await uploads.createGeneratedLocal(owner.id, M4A_BYTES, 'audio/m4a');
      expect(generated.bucket).toBe('database');
      expect(generated.objectKey).toMatch(/^db\/generated\/[0-9a-f-]{36}\.png$/);
      expect(generated.status).toBe('READY');
      const blob = await t.prisma.uploadBlob.findUniqueOrThrow({ where: { uploadId: generated.id } });
      expect(Buffer.from(blob.data).equals(PNG_BYTES)).toBe(true);
      expect(existsSync(join(LOCAL_DIR, 'generated', storedName(generated.objectKey)))).toBe(false);

      // Two generated outputs today, yet the one personal upload allowed still goes through.
      await uploadFile(t, owner, PNG_BYTES, 'image/png').expect(201);
      const over = await uploadFile(t, owner, PNG_BYTES, 'image/png').expect(429);
      expect(over.body.code).toBe('UPLOAD_QUOTA_EXCEEDED');
    });
  });

  it('removing an own upload deletes its stored bytes', async () => {
    const owner = await registerVerified(t);
    const upload = await uploadFile(t, owner, PNG_BYTES, 'image/png').expect(201);
    await t.http.delete(`${API}/uploads/${upload.body.data.id}`).set(owner.auth).expect(200);

    const row = await t.prisma.upload.findUniqueOrThrow({ where: { id: upload.body.data.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(await t.prisma.uploadBlob.count({ where: { uploadId: upload.body.data.id } })).toBe(0);
    await t.http.get(`${API}/uploads/${upload.body.data.id}/content`).set(owner.auth).expect(404);
  });

  it('discard deletes the stored bytes of a generated output', async () => {
    const owner = await registerVerified(t);
    const generated = await uploads.createGeneratedLocal(owner.id, PNG_BYTES, 'image/png');
    await uploads.discard(generated);
    expect(await t.prisma.uploadBlob.count({ where: { uploadId: generated.id } })).toBe(0);
    const row = await t.prisma.upload.findUniqueOrThrow({ where: { id: generated.id } });
    expect(row.status).toBe('DELETED');
  });

  it('deleteStoredFile removes database bytes without being awaited and never throws', async () => {
    const owner = await registerVerified(t);
    const generated = await uploads.createGeneratedLocal(owner.id, PNG_BYTES, 'image/png');
    expect(() => uploads.deleteStoredFile(generated)).not.toThrow();
    for (let i = 0; i < 50 && (await t.prisma.uploadBlob.count({ where: { uploadId: generated.id } })) > 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(await t.prisma.uploadBlob.count({ where: { uploadId: generated.id } })).toBe(0);

    // Without an id (older callers): found through bucket + object key.
    const other = await uploads.createGeneratedLocal(owner.id, PNG_BYTES, 'image/png');
    await uploads.deleteStoredFile({ bucket: other.bucket, objectKey: other.objectKey });
    expect(await t.prisma.uploadBlob.count({ where: { uploadId: other.id } })).toBe(0);

    // Nothing to delete is not an error.
    await expect(
      uploads.deleteStoredFile({ id: randomUUID(), bucket: 'database', objectKey: 'db/missing.png' }),
    ).resolves.toBeUndefined();
  });

  it('readBytes returns the bytes of a ready upload from whichever store holds it', async () => {
    const owner = await registerVerified(t);
    const stored = await uploadFile(t, owner, PNG_BYTES, 'image/png').expect(201);
    const fromDb = await uploads.readBytes(stored.body.data.id);
    expect(Buffer.isBuffer(fromDb)).toBe(true);
    expect(fromDb!.equals(PNG_BYTES)).toBe(true);

    const generated = await uploads.createGeneratedLocal(owner.id, M4A_BYTES, 'audio/m4a');
    expect((await uploads.readBytes(generated))!.equals(M4A_BYTES)).toBe(true);

    const legacy = await legacyLocalUpload(t, owner, PNG_BYTES, 'image/png', 'png');
    cleanup.push(legacy.path);
    expect((await uploads.readBytes(legacy.upload.id))!.equals(PNG_BYTES)).toBe(true);

    // Not ready, deleted, unknown, malformed, or bytes gone: null.
    await t.prisma.upload.update({ where: { id: generated.id }, data: { status: 'PENDING' } });
    expect(await uploads.readBytes(generated.id)).toBeNull();
    await uploads.discard({ id: stored.body.data.id, bucket: 'database', objectKey: 'unused' });
    expect(await uploads.readBytes(stored.body.data.id)).toBeNull();
    expect(await uploads.readBytes(randomUUID())).toBeNull();
    expect(await uploads.readBytes('not-a-uuid')).toBeNull();
    rmSync(legacy.path, { force: true });
    expect(await uploads.readBytes(legacy.upload.id)).toBeNull();
  });

  it('answers a byte-range request for audio with 206 and the requested slice', async () => {
    const owner = await registerVerified(t);
    const voice = await uploadFile(t, owner, M4A_BYTES, 'audio/m4a', 'voice-note.m4a').expect(201);
    const url = `${API}/uploads/${voice.body.data.id}/content`;
    const total = M4A_BYTES.length;

    const full = await t.http.get(url).set(owner.auth).buffer(true).parse(binary).expect(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect((full.body as Buffer).equals(M4A_BYTES)).toBe(true);

    const head = await t.http.get(url).set(owner.auth).set('Range', 'bytes=0-3').buffer(true).parse(binary).expect(206);
    expect(head.headers['content-range']).toBe(`bytes 0-3/${total}`);
    expect(head.headers['content-length']).toBe('4');
    expect(head.headers['accept-ranges']).toBe('bytes');
    expect(head.headers['content-type']).toContain('audio/m4a');
    expect(head.headers['cache-control']).toBe('private, no-store');
    expect((head.body as Buffer).equals(M4A_BYTES.subarray(0, 4))).toBe(true);

    const tail = await t.http.get(url).set(owner.auth).set('Range', 'bytes=10-').buffer(true).parse(binary).expect(206);
    expect(tail.headers['content-range']).toBe(`bytes 10-${total - 1}/${total}`);
    expect((tail.body as Buffer).equals(M4A_BYTES.subarray(10))).toBe(true);

    const suffix = await t.http.get(url).set(owner.auth).set('Range', 'bytes=-5').buffer(true).parse(binary).expect(206);
    expect(suffix.headers['content-range']).toBe(`bytes ${total - 5}-${total - 1}/${total}`);
    expect((suffix.body as Buffer).equals(M4A_BYTES.subarray(total - 5))).toBe(true);

    // A range ending past the file is clamped, one starting past it cannot be satisfied.
    const clamped = await t.http.get(url).set(owner.auth).set('Range', `bytes=50-${total + 100}`).buffer(true).parse(binary).expect(206);
    expect(clamped.headers['content-range']).toBe(`bytes 50-${total - 1}/${total}`);
    const unsatisfiable = await t.http.get(url).set(owner.auth).set('Range', `bytes=${total + 10}-`).expect(416);
    expect(unsatisfiable.headers['content-range']).toBe(`bytes */${total}`);

    // A malformed header is ignored: the whole file.
    const malformed = await t.http.get(url).set(owner.auth).set('Range', 'pages=1-2').buffer(true).parse(binary).expect(200);
    expect((malformed.body as Buffer).equals(M4A_BYTES)).toBe(true);

    // Range access never bypasses the access rules.
    await t.http.get(url).set('Range', 'bytes=0-3').expect(404);
  });

  it('images ignore byte ranges and are served whole', async () => {
    const owner = await registerVerified(t);
    const image = await uploadFile(t, owner, PNG_BYTES, 'image/png').expect(201);
    const res = await t.http
      .get(`${API}/uploads/${image.body.data.id}/content`)
      .set(owner.auth)
      .set('Range', 'bytes=0-3')
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((res.body as Buffer).equals(PNG_BYTES)).toBe(true);
  });

  it('keeps serving files stored on disk before the switch, and seed assets', async () => {
    const owner = await registerVerified(t);
    const legacy = await legacyLocalUpload(t, owner, PNG_BYTES, 'image/png', 'png');
    cleanup.push(legacy.path);
    const res = await t.http
      .get(`${API}/uploads/${legacy.upload.id}/content`)
      .set(owner.auth)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((res.body as Buffer).equals(PNG_BYTES)).toBe(true);

    // A legacy row whose file did not survive a deploy is a clean 404.
    rmSync(legacy.path, { force: true });
    await t.http.get(`${API}/uploads/${legacy.upload.id}/content`).set(owner.auth).expect(404);

    // Seed showcase assets ship inside the image and stay public.
    const seedKey = 'seed/showcase/work-ring.png';
    const seed =
      (await t.prisma.upload.findFirst({ where: { bucket: 'local-dev', objectKey: seedKey } })) ??
      (await t.prisma.upload.create({
        data: {
          ownerUserId: owner.id,
          bucket: 'local-dev',
          objectKey: seedKey,
          mimeType: 'image/png',
          sizeBytes: 1,
          status: 'READY',
          readyAt: new Date(),
        },
      }));
    const seedRes = await t.http.get(`${API}/uploads/${seed.id}/content`).buffer(true).parse(binary).expect(200);
    expect((seedRes.body as Buffer).equals(readFileSync(join(process.cwd(), 'seed-assets', 'showcase', 'work-ring.png')))).toBe(true);
    expect(seedRes.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('removing a legacy upload still deletes its file on disk', async () => {
    const owner = await registerVerified(t);
    const legacy = await legacyLocalUpload(t, owner, PNG_BYTES, 'image/png', 'png');
    cleanup.push(legacy.path);
    await t.http.delete(`${API}/uploads/${legacy.upload.id}`).set(owner.auth).expect(200);
    expect(existsSync(legacy.path)).toBe(false);
  });
});

describe("a design's preview picture", () => {
  let t: TestApp;
  let uploads: UploadsService;

  beforeAll(async () => {
    t = await createTestApp({ env: { STORAGE_DRIVER: 'database' } });
    uploads = t.app.get(UploadsService);
  });

  afterAll(async () => {
    await t.close();
  });

  async function designWithPreview(owner: TestUser, previewOwnerId = owner.id) {
    const design = await createDraftDesign(t, owner);
    const preview = await uploads.createGeneratedLocal(previewOwnerId, PNG_BYTES, 'image/png');
    await t.prisma.design.update({ where: { id: design.id }, data: { previewUploadId: preview.id, previewVersion: 1 } });
    return { designId: design.id, previewId: preview.id };
  }

  it('is public exactly while its design is listed (published or completed) and not deleted', async () => {
    const owner = await registerVerified(t);
    const { designId, previewId } = await designWithPreview(owner);
    const url = `${API}/uploads/${previewId}/content`;
    await t.http.get(url).expect(404);

    await t.prisma.design.update({ where: { id: designId }, data: { status: 'PUBLISHED' } });
    const published = await t.http.get(url).buffer(true).parse(binary).expect(200);
    expect((published.body as Buffer).equals(PNG_BYTES)).toBe(true);
    expect(published.headers['cache-control']).toBe('public, max-age=3600');

    await t.prisma.design.update({ where: { id: designId }, data: { status: 'COMPLETED' } });
    await t.http.get(url).expect(200);

    await t.prisma.design.update({ where: { id: designId }, data: { status: 'ARCHIVED' } });
    await t.http.get(url).expect(404);

    await t.prisma.design.update({ where: { id: designId }, data: { status: 'PUBLISHED', deletedAt: new Date() } });
    await t.http.get(url).expect(404);
  });

  it("is not published by someone else's design pointing at it", async () => {
    const owner = await registerVerified(t);
    const victim = await registerVerified(t);
    const { designId, previewId } = await designWithPreview(owner, victim.id);
    await t.prisma.design.update({ where: { id: designId }, data: { status: 'PUBLISHED' } });
    await t.http.get(`${API}/uploads/${previewId}/content`).expect(404);
  });

  it('counts as a use of the upload, so it cannot be removed while the design shows it', async () => {
    const owner = await registerVerified(t);
    const { designId, previewId } = await designWithPreview(owner);
    expect(await uploads.isReferencedElsewhere(previewId)).toBe(true);
    await expect(uploads.removeOwn(previewId, owner.id)).rejects.toMatchObject({ status: 409 });

    // A deleted design no longer uses its pictures.
    await t.prisma.design.update({ where: { id: designId }, data: { deletedAt: new Date() } });
    expect(await uploads.isReferencedElsewhere(previewId)).toBe(false);
  });
});

describe('local storage driver (development default)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { STORAGE_DRIVER: undefined } });
  });

  afterAll(async () => {
    await t.close();
  });

  it('keeps writing uploads to the local disk outside production', async () => {
    const owner = await registerVerified(t);
    const { result: res, localWrites } = await watchLocalWrites(() => uploadFile(t, owner, PNG_BYTES, 'image/png').expect(201));
    // (Also proves the spy used by the database-driver test sees the service's writes.)
    expect(localWrites).toHaveLength(1);
    const row = await t.prisma.upload.findUniqueOrThrow({ where: { id: res.body.data.id }, include: { blob: true } });
    expect(row.bucket).toBe('local-dev');
    expect(row.objectKey).toMatch(/^local\/[0-9a-f-]{36}\.png$/);
    expect(row.blob).toBeNull();
    const path = join(LOCAL_DIR, storedName(row.objectKey));
    expect(existsSync(path)).toBe(true);
    expect((await t.app.get(UploadsService).readBytes(row.id))!.equals(PNG_BYTES)).toBe(true);
    await t.http.delete(`${API}/uploads/${row.id}`).set(owner.auth).expect(200);
    expect(existsSync(path)).toBe(false);
  });
});
