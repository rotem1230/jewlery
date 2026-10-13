import { AI_ENGINE_ADAPTER, AiGenerateRequest, AiGenerateResult } from '../../src/ai/adapters/ai-engine.adapter';
import { AiService } from '../../src/ai/ai.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { createDraftDesign, registerVerified, TestUser } from '../utils/factories';

const GLB = Buffer.concat([Buffer.from('glTF', 'latin1'), Buffer.alloc(200, 7)]);

/**
 * AI engine fake: generations wait at a gate the test opens. Opening releases calls that are
 * already waiting and lets later ones through, so the test never races the background job.
 */
class GatedAiEngine {
  private isOpen = false;
  private waiting: Array<() => void> = [];
  calls = 0;

  async generate(_req: AiGenerateRequest): Promise<AiGenerateResult> {
    this.calls += 1;
    if (!this.isOpen) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    return { glb: GLB, providerRef: 'fake' };
  }

  open() {
    this.isOpen = true;
    const waiting = this.waiting;
    this.waiting = [];
    waiting.forEach((release) => release());
  }

  close() {
    this.isOpen = false;
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

  beforeEach(() => {
    engine.close();
  });

  afterEach(() => {
    engine.open();
  });

  afterAll(async () => {
    engine.open();
    await t.close();
  });

  it('returns immediately with a queued job that completes in the background', async () => {
    const user = await registerVerified(t);
    const res = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: 'twisted gold band' }).expect(202);
    expect(['QUEUED', 'RUNNING']).toContain(res.body.data.status);

    engine.open();
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
      engine.open();
      for (let i = 0; i < 2; i += 1) {
        const res = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: `idea ${i}` }).expect(202);
        await waitForJob(t, user, res.body.data.id, 'SUCCEEDED');
      }
      const third = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: 'idea 3' }).expect(429);
      expect(third.body.code).toBe('AI_QUOTA_EXCEEDED');
    } finally {
      await t.prisma.appConfig.delete({ where: { key: 'ai_limits' } });
    }
  });

  it('a generation the stale sweep already gave up on cannot come back as succeeded', async () => {
    const user = await registerVerified(t);
    const res = await t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt: 'slow one' }).expect(202);
    await waitForJob(t, user, res.body.data.id, 'RUNNING');

    const ai = t.app.get(AiService);
    expect(await ai.failStaleJobs(new Date(Date.now() + 60 * 60_000))).toBeGreaterThanOrEqual(1);
    engine.open();
    const inFlight = (ai as unknown as { inFlight: Set<Promise<void>> }).inFlight;
    await Promise.allSettled([...inFlight]);

    const job = await t.prisma.aiGenerationJob.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(job.status).toBe('FAILED');
    expect(job.outputUploadId).toBeNull();
    const kept = await t.prisma.upload.count({
      where: { ownerUserId: user.id, deletedAt: null, objectKey: { startsWith: 'local/generated/' } },
    });
    expect(kept).toBe(0);
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

  it('the daily render quota holds under simultaneous requests', async () => {
    await t.prisma.appConfig.upsert({
      where: { key: 'render_limits' },
      update: { value: { dailyPerUser: 2 }, version: { increment: 1 } },
      create: { key: 'render_limits', value: { dailyPerUser: 2 } },
    });
    try {
      const user = await registerVerified(t);
      const design = await createDraftDesign(t, user);
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          t.http.post(`${API}/render-jobs`).set(user.auth).send({ designId: design.id, exportFormat: 'STL' }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      expect(results.filter((r) => r.status === 429)).toHaveLength(6);
      expect(await t.prisma.renderJob.count({ where: { designId: design.id } })).toBe(2);
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
    await t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_PRO' }).expect(201);
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
