import { ConfigService } from '@nestjs/config';
import { TripoAiEngineAdapter } from './tripo-ai-engine.adapter';

type Call = { url: string; init?: RequestInit };

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('TripoAiEngineAdapter', () => {
  const calls: Call[] = [];
  const config = {
    get: (key: string) => (key === 'tripo.apiKey' ? 'tripo-test-key' : key === 'tripo.maxModelBytes' ? 1_000 : undefined),
  } as unknown as ConfigService;

  afterEach(() => {
    calls.length = 0;
    jest.restoreAllMocks();
  });

  function stubProvider(modelUrl: string, model: () => Response = () => new Response(Buffer.alloc(500, 1), { status: 200 })) {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/task')) {
        return json({ data: { task_id: 't-1' } });
      }
      if (url.includes('/task/t-1')) {
        return json({ data: { status: 'success', output: { model: modelUrl } } });
      }
      return model();
    });
  }

  function generate() {
    return new TripoAiEngineAdapter(config).generate({ prompt: 'ring', itemCode: 'RING' });
  }

  it('bounds every provider request with a timeout', async () => {
    stubProvider('https://cdn.tripo.test/model.glb');
    const result = await new TripoAiEngineAdapter(config).generate({
      prompt: 'ring',
      itemCode: 'RING',
    });
    expect(result.providerRef).toBe('tripo-t-1');
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.init?.signal).toBeInstanceOf(AbortSignal);
    }
  }, 10_000);

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
    await expect(new TripoAiEngineAdapter(config).generate({ prompt: 'ring', itemCode: 'RING' })).rejects.toThrow(/https/);
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

  it('makes the model from the inspiration picture when there is one (image to model)', async () => {
    const tasks: unknown[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/upload')) {
        const file = (init?.body as FormData).get('file') as Blob;
        expect(Buffer.from(await file.arrayBuffer()).equals(Buffer.from('jpeg-bytes'))).toBe(true);
        return json({ data: { image_token: 'img-1' } });
      }
      if (url.endsWith('/task')) {
        tasks.push(JSON.parse(String(init?.body)));
        return json({ data: { task_id: 't-1' } });
      }
      if (url.includes('/task/t-1')) return json({ data: { status: 'success', output: { model: 'https://cdn.tripo.test/m.glb' } } });
      return new Response(Buffer.alloc(500, 1), { status: 200 });
    });
    const result = await new TripoAiEngineAdapter(config).generate({
      prompt: 'ignored',
      itemCode: 'RING',
      image: { bytes: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' },
    });
    expect(result.providerRef).toBe('tripo-t-1');
    expect(tasks).toEqual([{ type: 'image_to_model', file: { type: 'jpg', file_token: 'img-1' } }]);
  }, 10_000);
});
