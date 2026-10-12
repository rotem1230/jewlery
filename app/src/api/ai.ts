/** POST /ai/inspiration and GET /ai/jobs/:id. Size/metal/setting/stone never call this. */
import { apiGet, apiPost } from '@/src/lib/api'

export type AiJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export type AiGenerationJob = {
  id: string
  designId: string | null
  prompt: string
  status: AiJobStatus
  outputUploadId: string | null
  /** Signed link to the generated model (see mediaUrl). */
  outputUrl?: string | null
  errorMessage: string | null
}

export function createInspiration(payload: { designId?: string; prompt: string }): Promise<AiGenerationJob> {
  return apiPost<AiGenerationJob>('/ai/inspiration', payload)
}

export function getAiJob(id: string): Promise<AiGenerationJob> {
  return apiGet<AiGenerationJob>(`/ai/jobs/${id}`)
}

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Generation runs in the background on the server (up to ~90 s with the provider): poll until the
 * job finishes or the window ends; the caller shows "still working" for a job that is not done.
 */
export async function waitForAiJob(
  id: string,
  options: { timeoutMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<AiGenerationJob> {
  const { timeoutMs = 120_000, intervalMs = 2_000, sleep = sleepFor, now = Date.now } = options
  const deadline = now() + timeoutMs
  for (;;) {
    await sleep(intervalMs)
    const job = await getAiJob(id)
    if (job.status !== 'QUEUED' && job.status !== 'RUNNING') return job
    if (now() >= deadline) return job
  }
}
