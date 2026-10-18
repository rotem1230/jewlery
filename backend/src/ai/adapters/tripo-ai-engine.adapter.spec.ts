import { ConfigService } from '@nestjs/config';
import { TRIPO_BASE, TRIPO_DEFAULT_MODEL, TripoAiEngineAdapter } from './tripo-ai-engine.adapter';

type Call = { url: string; init?: RequestInit };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function configWith(values: Record<string, unknown> = {}): ConfigService {
  const all: Record<string, unknown> = { 'tripo.apiKey': 'tripo-test-key', 'tripo.maxModelBytes': 1_000, ...values };
  return { get: (key: string) => all[key] } as unknown as ConfigService;
}

/** Tripo API v3 (v2 is being retired): one endpoint per task kind, `model` required. */
describe('TripoAiEngineAdapter (Tripo API v3)', () => {
  const calls: Call[] = [];
  const config = configWith();

  afterEach(() => {
    calls.length = 0;
    jest.restoreAllMocks();
  });

  function stubProvider(
    modelUrl: string,
    model: () => Response = () => new Response(Buffer.alloc(500, 1), { status: 200 }),
    task: () => Response = () => json({ code: 0, data: { task_id: 't-1', status: 'success', output: { model_url: modelUrl } } }),
  ) {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === `${TRIPO_BASE}/generation/text-to-model` || url === `${TRIPO_BASE}/generation/image-to-model`) {
        return json({ code: 0, data: { task_id: 't-1' } });
      }
      if (url === `${TRIPO_BASE}/tasks/t-1`) {
        return task();
      }
      return model();
    });
  }

  function generate(adapter = new TripoAiEngineAdapter(config), prompt = 'ring') {
    return adapter.generate({ prompt, itemCode: 'RING' });
  }

  it('calls the v3 API: text to model with a model version, then the task, then the model file', async () => {
    stubProvider('https://cdn.tripo.test/model.glb');
    const result = await generate();
    expect(result.providerRef).toBe('tripo-t-1');
    expect(TRIPO_BASE).toBe('https://openapi.tripo3d.ai/v3');
    expect(calls.map((c) => c.url)).toEqual([
      `${TRIPO_BASE}/generation/text-to-model`,
      `${TRIPO_BASE}/tasks/t-1`,
      'https://cdn.tripo.test/model.glb',
    ]);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toEqual({ prompt: expect.stringContaining('ring'), model: TRIPO_DEFAULT_MODEL });
    expect(body).not.toHaveProperty('type');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tripo-test-key');
    // Every provider call is bounded in time.
    for (const call of calls) {
      expect(call.init?.signal).toBeInstanceOf(AbortSignal);
    }
  }, 10_000);

  it('the model version can be chosen by configuration (TRIPO_MODEL)', async () => {
    stubProvider('https://cdn.tripo.test/model.glb');
    await generate(new TripoAiEngineAdapter(configWith({ 'tripo.model': 'v3.1-20260211' })));
    expect(JSON.parse(String(calls[0].init?.body)).model).toBe('v3.1-20260211');
  }, 10_000);

  it('keeps the prompt within the 1024 characters the provider accepts', async () => {
    stubProvider('https://cdn.tripo.test/model.glb');
    await generate(undefined, 'x'.repeat(1000));
    const prompt = JSON.parse(String(calls[0].init?.body)).prompt as string;
    expect(prompt.length).toBeLessThanOrEqual(1024);
    expect(prompt).toContain('jewelry');
  }, 10_000);

  it('makes the model from the inspiration picture when there is one (upload, then image to model)', async () => {
    const tasks: unknown[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === `${TRIPO_BASE}/files`) {
        const file = (init?.body as FormData).get('file') as Blob;
        expect(Buffer.from(await file.arrayBuffer()).equals(Buffer.from('jpeg-bytes'))).toBe(true);
        return json({ code: 0, data: { file_token: 'file_img1' } });
      }
      if (url === `${TRIPO_BASE}/generation/image-to-model`) {
        tasks.push(JSON.parse(String(init?.body)));
        return json({ code: 0, data: { task_id: 't-1' } });
      }
      if (url === `${TRIPO_BASE}/tasks/t-1`) {
        return json({ code: 0, data: { status: 'success', output: { model_url: 'https://cdn.tripo.test/m.glb' } } });
      }
      return new Response(Buffer.alloc(500, 1), { status: 200 });
    });
    const result = await new TripoAiEngineAdapter(config).generate({
      prompt: 'ignored',
      itemCode: 'RING',
      image: { bytes: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' },
    });
    expect(result.providerRef).toBe('tripo-t-1');
    expect(tasks).toEqual([{ input: 'file_img1', model: TRIPO_DEFAULT_MODEL }]);
  }, 10_000);

  it('a failed task is reported with the provider’s reason', async () => {
    stubProvider('https://cdn.tripo.test/model.glb', undefined, () =>
      json({ code: 0, data: { status: 'failed', error_code: 2008, error_message: 'Content rejected' } }),
    );
    await expect(generate()).rejects.toThrow(/failed.*2008.*Content rejected/);
  }, 10_000);

  it('a status the adapter does not know is a failure, not an endless wait', async () => {
    stubProvider('https://cdn.tripo.test/model.glb', undefined, () => json({ code: 0, data: { status: 'banned' } }));
    await expect(generate()).rejects.toThrow(/banned/);
  }, 10_000);

  it('an error answer (code other than 0) is reported even with HTTP 200', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => json({ code: 1004, message: 'model is required' }));
    await expect(generate()).rejects.toThrow(/1004.*model is required/);
  });

  it('does not follow redirects when downloading a model (an https link could bounce to an internal address)', async () => {
    stubProvider('https://cdn.tripo.test/model.glb');
    await generate();
    const download = calls.find((call) => call.url === 'https://cdn.tripo.test/model.glb');
    expect(download?.init?.redirect).toBe('error');
  }, 10_000);

  it('refuses a model larger than the configured cap, declared or not', async () => {
    stubProvider('https://cdn.tripo.test/model.glb', () => new Response(Buffer.alloc(5_000, 1), { status: 200 }));
    await expect(generate()).rejects.toThrow(/limit/);

    stubProvider('https://cdn.tripo.test/model.glb', () => {
      const chunks = [Buffer.alloc(600, 1), Buffer.alloc(600, 1)];
      const body = new ReadableStream({
        pull(controller) {
          const next = chunks.shift();
          if (next) controller.enqueue(new Uint8Array(next));
          else controller.close();
        },
      });
      return new Response(body, { status: 200 });
    });
    await expect(generate()).rejects.toThrow(/limit/);
  }, 20_000);

  it('downloads models only over https', async () => {
    stubProvider('http://169.254.169.254/latest/meta-data');
    await expect(generate()).rejects.toThrow(/https/);
    expect(calls.some((call) => call.url.startsWith('http://169.254.169.254'))).toBe(false);
  }, 10_000);

  it('a failing provider is reported, never replaced by a stand-in model', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('down', { status: 503 }));
    await expect(generate()).rejects.toThrow(/503/);
  });

  it('without TRIPO_API_KEY it is not configured and generates nothing', async () => {
    const bare = new TripoAiEngineAdapter({ get: () => undefined } as unknown as ConfigService);
    expect(bare.isConfigured()).toBe(false);
    await expect(bare.generate({ prompt: 'ring', itemCode: 'RING' })).rejects.toThrow(/TRIPO_API_KEY/);
    expect(new TripoAiEngineAdapter(config).isConfigured()).toBe(true);
  });
});
