import { ConfigService } from '@nestjs/config';
import {
  GEMINI_DEFAULT_IMAGE_MODEL,
  GEMINI_INTERACTIONS_URL,
  GeminiImageAiEngineAdapter,
} from './gemini-image-ai-engine.adapter';

type Call = { url: string; init?: RequestInit };

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 9)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 3)]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** An Interactions API answer whose model output holds the given content blocks. */
function interaction(content: unknown[], status = 'completed') {
  return { id: 'v1_abc', object: 'interaction', status, steps: [{ type: 'model_output', content }] };
}

function configWith(values: Record<string, unknown> = {}): ConfigService {
  const all: Record<string, unknown> = { 'gemini.apiKey': 'gemini-test-key', ...values };
  return { get: (key: string) => all[key] } as unknown as ConfigService;
}

/** Inspiration pictures are made by Google's Gemini image model (PRD: an image-generation provider). */
describe('GeminiImageAiEngineAdapter', () => {
  const calls: Call[] = [];
  const adapter = () => new GeminiImageAiEngineAdapter(configWith());

  afterEach(() => {
    calls.length = 0;
    jest.restoreAllMocks();
  });

  function answer(response: () => Response) {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return response();
    });
  }

  const body = () => JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;

  it('asks for one square JPEG picture of the piece from the note, with the key in a header', async () => {
    answer(() => json(interaction([{ type: 'image', mime_type: 'image/jpeg', data: JPEG.toString('base64') }])));
    const result = await adapter().generate({ prompt: 'twisted band with a small sapphire', itemCode: 'RING' });

    expect(result.image.equals(JPEG)).toBe(true);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.providerRef).toBe('gemini-v1_abc');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(GEMINI_INTERACTIONS_URL);
    expect(GEMINI_INTERACTIONS_URL).toBe('https://generativelanguage.googleapis.com/v1/interactions');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('gemini-test-key');
    expect(calls[0].url).not.toContain('gemini-test-key');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);

    const sent = body();
    expect(sent.model).toBe(GEMINI_DEFAULT_IMAGE_MODEL);
    expect(sent.store).toBe(false);
    expect(sent.response_format).toEqual({ type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1', image_size: '1K' });
    const input = sent.input as Array<{ type: string; text?: string }>;
    expect(input).toHaveLength(1);
    expect(input[0].type).toBe('text');
    expect(input[0].text).toContain('twisted band with a small sapphire');
    expect(input[0].text).toMatch(/ring/i);
  });

  it('works from the inspiration picture when there is one (sent inline with its type)', async () => {
    answer(() => json(interaction([{ type: 'image', mime_type: 'image/jpeg', data: JPEG.toString('base64') }])));
    await adapter().generate({ prompt: 'like this, in rose gold', itemCode: 'NECKLACE', image: { bytes: PNG, mimeType: 'image/png' } });
    const input = body().input as Array<{ type: string; text?: string; mime_type?: string; data?: string }>;
    expect(input.map((block) => block.type)).toEqual(['text', 'image']);
    expect(input[0].text).toContain('like this, in rose gold');
    expect(input[1].mime_type).toBe('image/png');
    expect(Buffer.from(input[1].data ?? '', 'base64').equals(PNG)).toBe(true);
  });

  it('the image model can be chosen by configuration (GEMINI_IMAGE_MODEL)', async () => {
    answer(() => json(interaction([{ type: 'image', mime_type: 'image/jpeg', data: JPEG.toString('base64') }])));
    await new GeminiImageAiEngineAdapter(configWith({ 'gemini.imageModel': 'gemini-3-pro-image' })).generate({ prompt: 'x', itemCode: 'RING' });
    expect(body().model).toBe('gemini-3-pro-image');
  });

  it('takes the last picture of the answer and its real type (PNG)', async () => {
    answer(() =>
      json(
        interaction([
          { type: 'text', text: 'Here you go' },
          { type: 'image', mime_type: 'image/png', data: PNG.toString('base64') },
        ]),
      ),
    );
    const result = await adapter().generate({ prompt: 'x', itemCode: 'RING' });
    expect(result.mimeType).toBe('image/png');
    expect(result.image.equals(PNG)).toBe(true);
  });

  it('an answer without a picture (e.g. refused by safety filters) fails with the model’s words', async () => {
    answer(() => json(interaction([{ type: 'text', text: 'I cannot create that image.' }])));
    await expect(adapter().generate({ prompt: 'x', itemCode: 'RING' })).rejects.toThrow(/no picture.*cannot create that image/i);
  });

  it('an interaction that did not complete fails', async () => {
    answer(() => json(interaction([], 'failed')));
    await expect(adapter().generate({ prompt: 'x', itemCode: 'RING' })).rejects.toThrow(/failed/);
  });

  it('bytes that are not a JPEG / PNG / WebP picture are refused', async () => {
    answer(() => json(interaction([{ type: 'image', mime_type: 'image/jpeg', data: Buffer.from('<html>not an image</html>').toString('base64') }])));
    await expect(adapter().generate({ prompt: 'x', itemCode: 'RING' })).rejects.toThrow(/not a picture/i);
  });

  it('a provider error is reported with its status, never replaced by a stand-in picture', async () => {
    answer(() => json({ error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }, 429));
    await expect(adapter().generate({ prompt: 'x', itemCode: 'RING' })).rejects.toThrow(/429.*Quota exceeded/);
  });

  it('without GEMINI_API_KEY it is not configured and calls nobody', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const bare = new GeminiImageAiEngineAdapter({ get: () => undefined } as unknown as ConfigService);
    expect(bare.isConfigured()).toBe(false);
    await expect(bare.generate({ prompt: 'x', itemCode: 'RING' })).rejects.toThrow(/GEMINI_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(adapter().isConfigured()).toBe(true);
  });
});
