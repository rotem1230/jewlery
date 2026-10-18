import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiEngineAdapter, AiGenerateRequest, AiGenerateResult } from './ai-engine.adapter';

/** Tripo API v3, international region (keys from developers.tripo3d.ai). v2 is being retired. */
export const TRIPO_BASE = 'https://openapi.tripo3d.ai/v3';
/** v3 requires a model version; this one keeps v2's default results and price (TRIPO_MODEL overrides). */
export const TRIPO_DEFAULT_MODEL = 'v2.5-20250123';
/** Longest prompt the provider accepts. */
const MAX_PROMPT_CHARS = 1024;
const POLL_MS = 2_000;
/** 3D tasks take one to ten minutes; under the 15-minute stale-job sweep in AiService. */
const MAX_WAIT_MS = 10 * 60 * 1000;
/** No single provider call may hang a worker (the job itself is bounded by MAX_WAIT_MS). */
const REQUEST_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_MODEL_BYTES = 50 * 1024 * 1024;

type TripoTask = {
  status?: string;
  output?: { model_url?: string };
  error_code?: number;
  error_message?: string;
};

/**
 * Generates a 3D model with Tripo (TRIPO_API_KEY): from the designer's inspiration picture when
 * there is one (image to model), otherwise from the prompt (text to model). The GLB is downloaded
 * at once (provider URLs expire). Failures are reported, never papered over with a stand-in model.
 */
@Injectable()
export class TripoAiEngineAdapter implements AiEngineAdapter {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('tripo.apiKey'));
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const apiKey = this.config.get<string>('tripo.apiKey');
    if (!apiKey) {
      throw new Error('No AI provider is configured (TRIPO_API_KEY)');
    }
    const model = this.config.get<string>('tripo.model') || TRIPO_DEFAULT_MODEL;
    const created = request.image
      ? await this.tripoFetch(apiKey, '/generation/image-to-model', {
          method: 'POST',
          body: JSON.stringify({ input: await this.uploadImage(apiKey, request.image), model }),
        })
      : await this.tripoFetch(apiKey, '/generation/text-to-model', {
          method: 'POST',
          body: JSON.stringify({ prompt: this.prompt(request), model }),
        });
    const taskId = (created as { task_id?: string }).task_id;
    if (!taskId) {
      throw new Error('Tripo did not return a task_id');
    }

    const started = Date.now();
    while (Date.now() - started < MAX_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const task = (await this.tripoFetch(apiKey, `/tasks/${taskId}`)) as TripoTask;
      if (task.status === 'queued' || task.status === 'running') {
        continue;
      }
      if (task.status !== 'success') {
        // failed / cancelled, or a state this adapter does not know: never wait on it.
        const reason = [task.error_code, task.error_message].filter((part) => part !== undefined).join(' ');
        throw new Error(`Tripo task ${task.status ?? 'without a status'}${reason ? `: ${reason}` : ''}`);
      }
      const url = task.output?.model_url;
      if (!url) {
        throw new Error('Tripo success without a model URL');
      }
      if (!url.startsWith('https://')) {
        throw new Error('Tripo returned a model URL that is not https');
      }
      // No redirects: an https link must not bounce the server to another (internal) address.
      const glbRes = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!glbRes.ok) {
        throw new Error(`Failed to download Tripo GLB (${glbRes.status})`);
      }
      const glb = await this.readCapped(glbRes, this.config.get<number>('tripo.maxModelBytes') ?? DEFAULT_MAX_MODEL_BYTES);
      if (glb.length < 100) {
        throw new Error('Tripo GLB was empty');
      }
      return { glb, providerRef: `tripo-${taskId}` };
    }
    throw new Error('Tripo task timed out');
  }

  /** The designer's words with the jewelry framing, within the provider's prompt limit. */
  private prompt(request: AiGenerateRequest): string {
    const suffix = `. Photorealistic ${request.itemCode.toLowerCase()} jewelry, single object, studio lighting.`;
    return `${request.prompt.slice(0, Math.max(0, MAX_PROMPT_CHARS - suffix.length))}${suffix}`;
  }

  /** The response body, refused as soon as it exceeds `maxBytes` (declared or actually sent). */
  private async readCapped(res: Response, maxBytes: number): Promise<Buffer> {
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`Tripo GLB is ${declared} bytes, over the ${maxBytes}-byte limit`);
    }
    if (!res.body) {
      return Buffer.alloc(0);
    }
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return Buffer.concat(chunks, total);
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Tripo GLB exceeded the ${maxBytes}-byte limit`);
      }
      chunks.push(Buffer.from(value));
    }
  }

  /** Uploads the inspiration picture to Tripo; returns its `file_token` (the task's `input`). */
  private async uploadImage(apiKey: string, image: { bytes: Buffer; mimeType: string }): Promise<string> {
    const extension = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), `inspiration.${extension}`);
    const data = (await this.tripoFetch(apiKey, '/files', { method: 'POST', body: form }, DOWNLOAD_TIMEOUT_MS)) as {
      file_token?: string;
    };
    if (!data.file_token) {
      throw new Error('Tripo did not return a file_token');
    }
    return data.file_token;
  }

  /** A v3 call: `{ code: 0, data }` on success; anything else is reported with Tripo's code and message. */
  private async tripoFetch(apiKey: string, path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    const isForm = init?.body instanceof FormData;
    const res = await fetch(`${TRIPO_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // fetch sets the multipart boundary itself.
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Tripo ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as { code?: number; message?: string; data?: unknown };
    if (body.code !== 0) {
      throw new Error(`Tripo ${path} code ${body.code ?? '?'}: ${(body.message ?? '').slice(0, 200)}`);
    }
    return body.data ?? {};
  }
}
