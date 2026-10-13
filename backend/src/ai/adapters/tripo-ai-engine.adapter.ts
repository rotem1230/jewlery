import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiEngineAdapter, AiGenerateRequest, AiGenerateResult } from './ai-engine.adapter';
import { DummyAiEngineAdapter } from './dummy-ai-engine.adapter';

const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';
const POLL_MS = 2_000;
const MAX_WAIT_MS = 90_000;
/** No single provider call may hang a worker (the job itself is bounded by MAX_WAIT_MS). */
const REQUEST_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_MODEL_BYTES = 50 * 1024 * 1024;

/**
 * Calls Tripo when TRIPO_API_KEY is set and downloads the GLB immediately
 * (provider URLs expire in about 5 minutes). Falls back to the dummy catalog copy.
 */
@Injectable()
export class TripoAiEngineAdapter implements AiEngineAdapter {
  private readonly logger = new Logger(TripoAiEngineAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dummy: DummyAiEngineAdapter,
  ) {}

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const apiKey = this.config.get<string>('tripo.apiKey');
    if (!apiKey) {
      return this.dummy.generate(request);
    }

    try {
      return await this.generateFromTripo(apiKey, request);
    } catch (err) {
      this.logger.warn(`Tripo failed, using dummy GLB: ${(err as Error).message}`);
      return this.dummy.generate(request);
    }
  }

  private async generateFromTripo(apiKey: string, request: AiGenerateRequest): Promise<AiGenerateResult> {
    const jewelryPrompt = `${request.prompt}. Photorealistic ${request.itemCode.toLowerCase()} jewelry, single object, studio lighting.`;
    const created = await this.tripoFetch(apiKey, '/task', {
      method: 'POST',
      body: JSON.stringify({ type: 'text_to_model', prompt: jewelryPrompt }),
    });
    const taskId = (created as { data?: { task_id?: string } }).data?.task_id;
    if (!taskId) {
      throw new Error('Tripo did not return a task_id');
    }

    const started = Date.now();
    while (Date.now() - started < MAX_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const status = (await this.tripoFetch(apiKey, `/task/${taskId}`)) as {
        data?: { status?: string; output?: { pbr_model?: string; model?: string } };
      };
      const state = status.data?.status;
      if (state === 'success') {
        const url = status.data?.output?.pbr_model ?? status.data?.output?.model;
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
      if (state === 'failed' || state === 'cancelled' || state === 'unknown') {
        throw new Error(`Tripo task ${state}`);
      }
    }
    throw new Error('Tripo task timed out');
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

  private async tripoFetch(apiKey: string, path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${TRIPO_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Tripo ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return res.json();
  }
}
