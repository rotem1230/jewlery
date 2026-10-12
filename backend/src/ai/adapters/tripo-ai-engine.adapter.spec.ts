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
  const config = { get: (key: string) => (key === 'tripo.apiKey' ? 'tripo-test-key' : undefined) } as unknown as ConfigService;

  afterEach(() => {
    calls.length = 0;
    jest.restoreAllMocks();
  });

  function stubProvider(modelUrl: string) {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/task')) {
        return json({ data: { task_id: 't-1' } });
      }
      if (url.includes('/task/t-1')) {
        return json({ data: { status: 'success', output: { model: modelUrl } } });
      }
      return new Response(Buffer.alloc(500, 1), { status: 200 });
    });
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
