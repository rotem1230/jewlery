import { ConfigService } from '@nestjs/config';
import { DummyAiEngineAdapter } from './dummy-ai-engine.adapter';
import { TripoAiEngineAdapter } from './tripo-ai-engine.adapter';

type Call = { url: string; init?: RequestInit };

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('TripoAiEngineAdapter', () => {
  const calls: Call[] = [];
  const dummy = { generate: jest.fn(async () => ({ glb: Buffer.alloc(200), providerRef: 'dummy' })) };
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
    return new TripoAiEngineAdapter(config, dummy as unknown as DummyAiEngineAdapter).generate({ prompt: 'ring', itemCode: 'RING' });
  }

  it('bounds every provider request with a timeout', async () => {
    stubProvider('https://cdn.tripo.test/model.glb');
    const result = await new TripoAiEngineAdapter(config, dummy as unknown as DummyAiEngineAdapter).generate({
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
    expect((await generate()).providerRef).toBe('dummy');

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
    expect((await generate()).providerRef).toBe('dummy');
  }, 20_000);

  it('downloads models only over https', async () => {
    stubProvider('http://169.254.169.254/latest/meta-data');
    const result = await new TripoAiEngineAdapter(config, dummy as unknown as DummyAiEngineAdapter).generate({
      prompt: 'ring',
      itemCode: 'RING',
    });
    expect(calls.some((call) => call.url.startsWith('http://169.254.169.254'))).toBe(false);
    expect(result.providerRef).toBe('dummy');
  }, 10_000);
});
