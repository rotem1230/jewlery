import { API, createTestApp, TestApp } from '../utils/test-app';
import { VALID_RING_PARAMETERS, createDraftDesign, registerVerified } from '../utils/factories';

/**
 * The client's catalogue (her Drive folder) end to end: what the studio is offered, what a design
 * may hold, and that an export is built from those choices.
 */
describe('the client catalogue', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('offers her 24 stones (with their cuts), 11 heads, 11 band styles on rings, and 23 elements', async () => {
    const stones = (await t.http.get(`${API}/master-data/stones`).expect(200)).body.data as Array<{
      code: string;
      options: Array<{ kind: string; value: string }>;
    }>;
    expect(stones.map((s) => s.code)).toEqual(expect.arrayContaining(['DIAMOND', 'MOISSANITE', 'TANZANITE', 'LAPIS_LAZULI', 'LABRADORITE']));
    expect(stones).toHaveLength(24);
    const opal = stones.find((s) => s.code === 'OPAL')!;
    expect(opal.options.filter((o) => o.kind === 'SHAPE').map((o) => o.value)).toEqual(['CABOCHON', 'CABOCHON_OVAL']);

    const settings = (await t.http.get(`${API}/master-data/settings`).expect(200)).body.data as Array<{
      code: string;
      itemTypes: Array<{ itemType: { code: string } }>;
    }>;
    const codes = settings.map((s) => s.code);
    expect(codes).not.toContain('4_PRONG');
    expect(codes).toHaveLength(22);
    const pave = settings.find((s) => s.code === 'PAVE')!;
    expect(pave.itemTypes.map((l) => l.itemType.code)).toEqual(['RING']);

    const elements = (await t.http.get(`${API}/master-data/elements`).expect(200)).body.data as Array<{ code: string }>;
    expect(elements.map((e) => e.code)).not.toContain('INITIAL');
    expect(elements).toHaveLength(23);
  });

  it('a design keeps to the catalogue: a cut the stone does not come in, a colour off the chart, a too-narrow band are refused', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const save = (parameters: Record<string, unknown>, status: number) =>
      t.http
        .patch(`${API}/designs/${design.id}`)
        .set(user.auth)
        .send({ version: 1, parameters: { ...VALID_RING_PARAMETERS, ...parameters } })
        .expect(status);

    const cut = await save({ stones: [{ stoneCode: 'TURQUOISE', cutCode: 'ROUND' }] }, 400);
    expect(JSON.stringify(cut.body)).toContain('TURQUOISE comes only as CABOCHON, CABOCHON_OVAL');
    const color = await save({ stones: [{ stoneCode: 'RUBY', colorCode: 'NEON' }] }, 400);
    expect(JSON.stringify(color.body)).toContain('not a colour of the chart');
    const narrow = await save(
      {
        size: { ...VALID_RING_PARAMETERS.size, bandWidthMm: 3 },
        setting: { band: { settingCode: 'PAVE', stoneCode: 'DIAMOND', stoneSizeMm: 2, rows: 2 } },
      },
      400,
    );
    expect(JSON.stringify(narrow.body)).toContain('pavé table');
    const head = await save({ size: { ...VALID_RING_PARAMETERS.size, bandWidthMm: 2 }, setting: { headCode: 'BRIGHT_CUT', settingCode: 'BRIGHT_CUT' } }, 400);
    expect(JSON.stringify(head.body)).toContain('BRIGHT_CUT');
  });

  it('the choices are saved and the STL is built with them, placed where the user put them', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const plain = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
    expect(plain.body.data.status).toBe('SUCCEEDED');
    const parameters = {
      ...VALID_RING_PARAMETERS,
      size: { ...VALID_RING_PARAMETERS.size, bandWidthMm: 4 },
      stones: [
        { stoneCode: 'SAPPHIRE', cutCode: 'OVAL', colorCode: 'LIGHT_ROSE', sizeMm: 6, placement: { angleDeg: 90, offsetMm: 0, rotationDeg: 30 } },
        { stoneCode: 'OPAL', cutCode: 'CABOCHON', colorCode: 'WHITE_OPAL', sizeMm: 2.5, placement: { angleDeg: 20, offsetMm: 0.5 } },
      ],
      elements: [{ elementCode: 'LETTERS', text: 'דנה', sizeMm: 5, placement: { angleDeg: 200, offsetMm: 0, rotationDeg: 0 } }],
      setting: {
        headCode: 'HALF_BEZEL',
        settingCode: 'HALF_BEZEL',
        band: { settingCode: 'PAVE', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 1, rows: 2, placement: { angleDeg: 270 } },
      },
    };
    const saved = await t.http.patch(`${API}/designs/${design.id}`).set(user.auth).send({ version: 1, parameters }).expect(200);
    expect(saved.body.data.parameters.stones[0]).toMatchObject({ cutCode: 'OVAL', colorCode: 'LIGHT_ROSE' });
    const job = await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
    expect(job.body.data.status).toBe('SUCCEEDED');
    const sizeOf = async (uploadId: string) => {
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
      return (res.body as Buffer).readUInt32LE(80);
    };
    // A head, a pavé band, a name: many more triangles than the plain band.
    expect(await sizeOf(job.body.data.outputUploadId)).toBeGreaterThan((await sizeOf(plain.body.data.outputUploadId)) * 3);
  });
});
