import { AI_ENGINE_ADAPTER, AiGenerateRequest, AiGenerateResult } from '../../src/ai/adapters/ai-engine.adapter';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { createDraftDesign, registerVerified, TestUser } from '../utils/factories';

const GLB = Buffer.concat([Buffer.from('glTF', 'latin1'), Buffer.alloc(200, 7)]);

/** AI engine fake whose generations finish only when the test says so. */
class GatedAiEngine {
  private releases: Array<() => void> = [];
  calls = 0;

  generate(_req: AiGenerateRequest): Promise<AiGenerateResult> {
    this.calls += 1;
    return new Promise((resolve) => {
      this.releases.push(() => resolve({ glb: GLB, providerRef: 'fake' }));
    });
  }

  releaseAll() {
    const pending = this.releases;
    this.releases = [];
    pending.forEach((release) => release());
  }
}

async function waitForJob(t: TestApp, user: TestUser, id: string, status: string) {
  for (let i = 0; i < 100; i += 1) {
    const res = await t.http.get(`${API}/ai/jobs/${id}`).set(user.auth).expect(200);
    if (res.body.data.status === status) {
      return res.body.data;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`job ${id} never reached ${status}`);
}

/**
 * Regression: POST /ai/inspiration ran a paid provider call (up to 90 s, synchronously) for any
 * account with no quota, letting a single user burn the provider budget and tie up the API.
 */
describe('AI generation limits', () => {
  let t: TestApp;
  const engine = new GatedAiEngine();

  beforeAll(async () => {
    t = await createTestApp({
      configure: (b) => b.overrideProvider(AI_ENGINE_ADAPTER).useValue(engine),
    });
  });

  afterEach(() => {
    engine.releaseAll();
  });

  afterAll(async () => {
    engine.releaseAll();
    await t.close();
  });

  it('returns immediately with a queued job that completes in the background', async () => {
    const user = await registerVerified(t);
    const res = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: 'twisted gold band' }).expect(202);
    expect(['QUEUED', 'RUNNING']).toContain(res.body.data.status);

    engine.releaseAll();
    const done = await waitForJob(t, user, res.body.data.id, 'SUCCEEDED');
    expect(done.outputUploadId).toBeTruthy();
    expect(done.outputUrl).toMatch(/^\/uploads\/.+\/content\?exp=/);
  });

  it('allows one in-flight generation per user', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: 'first' }).expect(202);
    const second = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: 'second' }).expect(409);
    expect(second.body.code).toBe('AI_JOB_IN_PROGRESS');
  });

  it('enforces the daily per-user quota', async () => {
    await t.prisma.appConfig.upsert({
      where: { key: 'ai_limits' },
      update: { value: { dailyPerUser: 2 }, version: { increment: 1 } },
      create: { key: 'ai_limits', value: { dailyPerUser: 2 } },
    });
    try {
      const user = await registerVerified(t);
      for (let i = 0; i < 2; i += 1) {
        const res = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: `idea ${i}` }).expect(202);
        engine.releaseAll();
        await waitForJob(t, user, res.body.data.id, 'SUCCEEDED');
      }
      const third = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: 'idea 3' }).expect(429);
      expect(third.body.code).toBe('AI_QUOTA_EXCEEDED');
    } finally {
      await t.prisma.appConfig.delete({ where: { key: 'ai_limits' } });
    }
  });

  it('caps the prompt length', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: 'x'.repeat(1001) }).expect(400);
  });
});

describe('render job limits and ownership', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('enforces the daily per-user render quota', async () => {
    await t.prisma.appConfig.upsert({
      where: { key: 'render_limits' },
      update: { value: { dailyPerUser: 1 }, version: { increment: 1 } },
      create: { key: 'render_limits', value: { dailyPerUser: 1 } },
    });
    try {
      const user = await registerVerified(t);
      const design = await createDraftDesign(t, user);
      await t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }).expect(201);
      const res = await t.http
        .post(`${API}/render-jobs`)
        .set(user.auth)
        .send({ designId: design.id, exportFormat: 'STL' })
        .expect(429);
      expect(res.body.code).toBe('RENDER_QUOTA_EXCEEDED');
    } finally {
      await t.prisma.appConfig.delete({ where: { key: 'render_limits' } });
    }
  });

  it('a non-owner is refused before anything is written', async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    await t.prisma.designVersion.deleteMany({ where: { designId: design.id } });
    const intruder = await registerVerified(t);

    await t.http.post(`${API}/render-jobs`).set(intruder.auth).send({ designId: design.id }).expect(403);
    expect(await t.prisma.designVersion.count({ where: { designId: design.id } })).toBe(0);
  });

  it('a finished render exposes a signed output URL to its owner', async () => {
    const user = await registerVerified(t);
    const design = await createDraftDesign(t, user);
    const res = await t.http
      .post(`${API}/render-jobs`)
      .set(user.auth)
      .send({ designId: design.id, exportFormat: 'PNG_HD' })
      .expect(201);
    expect(res.body.data.outputUrl).toMatch(/^\/uploads\/.+\/content\?exp=/);
    await t.http.get(`${API}${res.body.data.outputUrl}`).expect(200);
  });
});
