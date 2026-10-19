import * as jpeg from 'jpeg-js';
import { decodePng, encodePng } from '../../src/jewelry/png';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { createDraftDesign, registerVerified, TestUser } from '../utils/factories';
import { uploadFile } from '../utils/files';

/** A flat teal "photo", so anything the try-on adds stands out. */
function photo(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 20;
    data[i + 1] = 140;
    data[i + 2] = 150;
    data[i + 3] = 255;
  }
  return encodePng({ width, height, data });
}

async function binary(t: TestApp, user: TestUser, path: string, status = 200): Promise<Buffer> {
  const res = await t.http
    .get(path)
    .set(user.auth)
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (c: Buffer) => chunks.push(c));
      response.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .expect(status);
  return res.body as Buffer;
}

describe('Try-on composes the design onto the photo', () => {
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
    await t.prisma.featureFlag.update({ where: { key: 'phase2_visualization' }, data: { enabled: false } });
    await t.close();
  });

  async function proDesigner() {
    const user = await registerVerified(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_PREMIUM_QUARTERLY' }).expect(201);
    const design = await createDraftDesign(t, user);
    return { user, design };
  }

  it('puts the ring where the designer placed it, at that size, and leaves the rest of the photo', async () => {
    const { user, design } = await proDesigner();
    const selfie = await uploadFile(t, user, photo(400, 300), 'image/png', 'hand.png').expect(201);
    const job = await t.http
      .post(`${API}/visualization/jobs`)
      .set(user.auth)
      .send({ designId: design.id, inputUploadId: selfie.body.data.id, placement: { x: 0.25, y: 0.5, scale: 0.4, rotation: 15 } })
      .expect(201);
    expect(job.body.data.status).toBe('SUCCEEDED');
    expect(job.body.data.outputUploadId).not.toBe(selfie.body.data.id);

    const out = jpeg.decode(await binary(t, user, `${API}/uploads/${job.body.data.outputUploadId}/content`), { useTArray: true });
    expect([out.width, out.height]).toEqual([400, 300]);
    const at = (x: number, y: number) => {
      const i = (y * out.width + x) * 4;
      return [out.data[i], out.data[i + 1], out.data[i + 2]];
    };
    const teal = (p: number[]) => Math.abs(p[0] - 20) < 25 && Math.abs(p[1] - 140) < 25 && Math.abs(p[2] - 150) < 25;
    // Far right: untouched photo.
    expect(teal(at(370, 40))).toBe(true);
    expect(teal(at(370, 260))).toBe(true);
    // Around the placement centre (x = 100 px): the yellow-gold ring changed the photo.
    let changed = 0;
    for (let y = 100; y < 200; y += 4) for (let x = 40; x < 160; x += 4) if (!teal(at(x, y))) changed++;
    expect(changed).toBeGreaterThan(40);
  });

  it('serves the transparent overlay the app places, only to the design owner', async () => {
    const { user, design } = await proDesigner();
    const png = decodePng(await binary(t, user, `${API}/visualization/designs/${design.id}/overlay`));
    expect(png.width).toBe(768);
    expect(png.data[3]).toBe(0);
    let opaque = 0;
    for (let i = 3; i < png.data.length; i += 4 * 13) if (png.data[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(200);

    // Even with try-on in their plan, nobody else gets a picture of this design.
    const { user: stranger } = await proDesigner();
    await binary(t, stranger, `${API}/visualization/designs/${design.id}/overlay`, 404);
  });

  it('the overlay is gated like a try-on: a free designer is refused', async () => {
    const free = await registerVerified(t);
    const design = await createDraftDesign(t, free);
    const res = await t.http.get(`${API}/visualization/designs/${design.id}/overlay`).set(free.auth).expect(403);
    expect(res.body.code).toBe('PAYWALL');
  });

  it('refuses a placement outside the photo or of absurd size', async () => {
    const { user, design } = await proDesigner();
    const selfie = await uploadFile(t, user, photo(64, 64), 'image/png', 'p.png').expect(201);
    for (const placement of [{ x: 1.4, y: 0.5, scale: 0.3, rotation: 0 }, { x: 0.5, y: 0.5, scale: 9, rotation: 0 }]) {
      await t.http
        .post(`${API}/visualization/jobs`)
        .set(user.auth)
        .send({ designId: design.id, inputUploadId: selfie.body.data.id, placement })
        .expect(400);
    }
  });
});
