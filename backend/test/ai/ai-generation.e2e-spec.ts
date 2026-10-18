import { AI_ENGINE_ADAPTER, AiGenerateRequest, AiGenerateResult } from '../../src/ai/adapters/ai-engine.adapter';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { PNG_BYTES, uploadFile } from '../utils/files';
import { VALID_RING_PARAMETERS, createDraftDesign, registerVerified } from '../utils/factories';

/** A generated inspiration picture (JPEG signature). */
const PICTURE = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);

/** Records what the platform asks the provider for; fails on demand. */
class RecordingEngine {
  requests: AiGenerateRequest[] = [];
  failNext = false;

  isConfigured(): boolean {
    return true;
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    this.requests.push(request);
    if (this.failNext) {
      this.failNext = false;
      throw new Error('provider down');
    }
    return { image: PICTURE, mimeType: 'image/jpeg', providerRef: 'recorded' };
  }
}

async function finished(t: TestApp, auth: { Authorization: string }, id: string) {
  for (let i = 0; i < 100; i++) {
    const res = await t.http.get(`${API}/ai/jobs/${id}`).set(auth).expect(200);
    if (!['QUEUED', 'RUNNING'].includes(res.body.data.status)) return res.body.data;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('AI job never finished');
}

describe('AI generation is real or refused', () => {
  it('without a provider (no GEMINI_API_KEY) the request is refused and no job is made', async () => {
    const t = await createTestApp();
    try {
      const user = await registerVerified(t);
      const design = await createDraftDesign(t, user);
      const res = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ designId: design.id, prompt: 'twisted band' }).expect(503);
      expect(res.body.code).toBe('AI_NOT_CONFIGURED');
      expect(await t.prisma.aiGenerationJob.count({ where: { requestedById: user.id } })).toBe(0);
    } finally {
      await t.close();
    }
  });

  describe('with a provider', () => {
    let t: TestApp;
    const engine = new RecordingEngine();

    beforeAll(async () => {
      t = await createTestApp({ configure: (b) => b.overrideProvider(AI_ENGINE_ADAPTER).useValue(engine) });
    });

    afterAll(async () => {
      await t.close();
    });

    it('sends the design inspiration picture to the provider', async () => {
      const user = await registerVerified(t);
      const design = await createDraftDesign(t, user);
      const picture = await uploadFile(t, user, PNG_BYTES, 'image/png', 'idea.png').expect(201);
      await t.http
        .patch(`${API}/designs/${design.id}`)
        .set(user.auth)
        .send({ version: 1, parameters: { ...VALID_RING_PARAMETERS, inspirationUploadId: picture.body.data.id } })
        .expect(200);
      engine.requests.length = 0;
      const job = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ designId: design.id, prompt: 'like this' }).expect(202);
      const done = await finished(t, user.auth, job.body.data.id);
      expect(done.status).toBe('SUCCEEDED');
      expect(engine.requests).toHaveLength(1);
      expect(engine.requests[0].image?.mimeType).toBe('image/png');
      expect(engine.requests[0].image?.bytes.equals(PNG_BYTES)).toBe(true);
    });

    it('the provider is told the design choices (the catalog names of what the designer picked)', async () => {
      const user = await registerVerified(t);
      const design = await createDraftDesign(t, user);
      await t.http
        .patch(`${API}/designs/${design.id}`)
        .set(user.auth)
        .send({
          version: 1,
          parameters: { ...VALID_RING_PARAMETERS, stones: [{ stoneCode: 'SAPPHIRE' }], setting: { settingCode: 'BEZEL' } },
        })
        .expect(200);
      engine.requests.length = 0;
      const job = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ designId: design.id, prompt: 'delicate' }).expect(202);
      await finished(t, user.auth, job.body.data.id);
      expect(engine.requests[0].choices).toEqual({
        metal: '14K yellow gold',
        stones: ['sapphire'],
        setting: 'bezel setting',
        elements: [],
      });
    });

    it('the result is an inspiration picture the owner can open (stored as the image it is)', async () => {
      const user = await registerVerified(t);
      const design = await createDraftDesign(t, user);
      const job = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ designId: design.id, prompt: 'a twisted band' }).expect(202);
      const done = await finished(t, user.auth, job.body.data.id);
      expect(done.status).toBe('SUCCEEDED');
      const upload = await t.prisma.upload.findUniqueOrThrow({ where: { id: done.outputUploadId } });
      expect(upload.mimeType).toBe('image/jpeg');
      expect(upload.ownerUserId).toBe(user.id);
      const picture = await t.http.get(`${API}${done.outputUrl}`).buffer(true).expect(200);
      expect(picture.headers['content-type']).toMatch(/^image\/jpeg/);
      expect(Buffer.from(picture.body).equals(PICTURE)).toBe(true);
    });

    it('a picture id the design owner does not own is not sent', async () => {
      const owner = await registerVerified(t);
      const other = await registerVerified(t);
      const foreign = await uploadFile(t, other, PNG_BYTES, 'image/png', 'x.png').expect(201);
      const design = await createDraftDesign(t, owner);
      await t.prisma.design.update({
        where: { id: design.id },
        data: { parameters: { ...VALID_RING_PARAMETERS, inspirationUploadId: foreign.body.data.id } },
      });
      engine.requests.length = 0;
      const job = await t.http.post(`${API}/ai/inspiration`).set(owner.auth).send({ designId: design.id, prompt: 'text only' }).expect(202);
      await finished(t, owner.auth, job.body.data.id);
      expect(engine.requests[0].image).toBeUndefined();
      expect(engine.requests[0].prompt).toBe('text only');
    });

    it('a provider failure fails the job with no picture attached', async () => {
      const user = await registerVerified(t);
      engine.failNext = true;
      const job = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: 'will fail' }).expect(202);
      const done = await finished(t, user.auth, job.body.data.id);
      expect(done.status).toBe('FAILED');
      expect(done.outputUploadId).toBeNull();
      expect(done.outputUrl).toBeNull();
    });
  });
});
