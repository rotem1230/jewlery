import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiEngineAdapter, AiGenerateRequest, AiGenerateResult } from './ai-engine.adapter';

/** Gemini Interactions API, stable version (keys from https://aistudio.google.com/apikey). */
export const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1/interactions';
/** Nano Banana 2: stable, about $0.07 per 1K picture (GEMINI_IMAGE_MODEL overrides). */
export const GEMINI_DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
/** A picture takes seconds; the wait is bounded so a hung call cannot hold a worker. */
const REQUEST_TIMEOUT_MS = 120_000;
/** Largest picture accepted from the provider (a 1K JPEG is a few hundred KB). */
const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

const ITEM_NAMES: Record<string, string> = {
  RING: 'ring',
  EARRINGS: 'pair of earrings',
  NECKLACE: 'necklace',
  BRACELET: 'bracelet',
};

type ContentBlock = { type?: string; text?: string; data?: string; mime_type?: string };
type Interaction = { id?: string; status?: string; steps?: Array<{ type?: string; content?: ContentBlock[] }> };

/** The picture type from its first bytes: only JPEG, PNG and WebP are kept. */
function pictureType(bytes: Buffer): string | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Makes the inspiration picture of the design wizard's last step (PRD 5.4, step 7: "upload an
 * inspiration image or generate using AI") with Google's Gemini image model: from the designer's
 * note, and from their inspiration picture when there is one. Requests are not stored by Google
 * (`store: false`); the key travels in a header, never in the URL. Failures are reported, never
 * replaced by a stand-in picture.
 */
@Injectable()
export class GeminiImageAiEngineAdapter implements AiEngineAdapter {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('gemini.apiKey'));
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const apiKey = this.config.get<string>('gemini.apiKey');
    if (!apiKey) {
      throw new Error('No AI provider is configured (GEMINI_API_KEY)');
    }
    const model = this.config.get<string>('gemini.imageModel') || GEMINI_DEFAULT_IMAGE_MODEL;
    const input: ContentBlock[] = [{ type: 'text', text: this.prompt(request) }];
    if (request.image) {
      input.push({ type: 'image', mime_type: request.image.mimeType, data: request.image.bytes.toString('base64') });
    }
    const res = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input,
        response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1', image_size: '1K' },
        store: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      let message = text.slice(0, 200);
      try {
        message = (JSON.parse(text) as { error?: { message?: string } }).error?.message?.slice(0, 200) ?? message;
      } catch {
        // not JSON: the raw text is reported
      }
      throw new Error(`Gemini ${res.status}: ${message}`);
    }
    const interaction = (await res.json()) as Interaction;
    if (interaction.status !== 'completed') {
      throw new Error(`Gemini interaction ${interaction.status ?? 'without a status'}`);
    }
    const blocks = (interaction.steps ?? []).filter((step) => step.type === 'model_output').flatMap((step) => step.content ?? []);
    const picture = [...blocks].reverse().find((block) => block.type === 'image' && block.data);
    if (!picture?.data) {
      const said = blocks.map((block) => block.text).filter(Boolean).join(' ').slice(0, 200);
      throw new Error(`Gemini returned no picture${said ? `: ${said}` : ''}`);
    }
    const image = Buffer.from(picture.data, 'base64');
    if (image.length > MAX_PICTURE_BYTES) {
      throw new Error(`Gemini picture is ${image.length} bytes, over the ${MAX_PICTURE_BYTES}-byte limit`);
    }
    const mimeType = pictureType(image);
    if (!mimeType) {
      throw new Error('Gemini returned data that is not a picture');
    }
    return { image, mimeType, providerRef: `gemini-${interaction.id ?? 'unknown'}` };
  }

  /** The designer's words, framed as a product picture of the chosen kind of piece. */
  private prompt(request: AiGenerateRequest): string {
    const item = ITEM_NAMES[request.itemCode] ?? 'piece of jewelry';
    const reference = request.image ? ' Use the attached picture as the inspiration.' : '';
    return (
      `A photorealistic product photograph of a handmade ${item}, as a design inspiration for a jeweler.` +
      `${reference} The designer's note (may be in Hebrew): "${request.prompt}". ` +
      'One piece, centered, studio lighting, plain light background, no people, no text or logos.'
    );
  }
}
