/** Render jobs — STL / OBJ for manufacturing, HD pictures; built from the design's parameters. */
import { apiGet, apiPost } from '@/src/lib/api'

export type RenderExportFormat = 'STL' | 'OBJ' | 'PNG_HD'

export type RenderJob = {
  id: string
  designId: string
  exportFormat: RenderExportFormat | null
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  outputUploadId: string | null
  /** Signed link to the exported file. */
  outputUrl?: string | null
  errorMessage: string | null
}

/** The server answers within ~8 s (RUNNING when the file takes longer; see waitForRenderJob). */
const CREATE_TIMEOUT_MS = 30_000

export function createRenderJob(payload: {
  designId: string
  exportFormat: RenderExportFormat
}): Promise<RenderJob> {
  return apiPost<RenderJob>('/render-jobs', payload, { timeoutMs: CREATE_TIMEOUT_MS })
}

export function getRenderJob(id: string, signal?: AbortSignal): Promise<RenderJob> {
  return apiGet<RenderJob>(`/render-jobs/${id}`, { signal })
}

const POLL_MS = 1500
const POLL_LIMIT_MS = 3 * 60 * 1000

/**
 * Waits for a job the server answered while still running (HD pictures take a while on a small
 * server): polls until it ends or `limitMs` passes, then returns its last state.
 */
export async function waitForRenderJob(
  job: RenderJob,
  options: { pollMs?: number; limitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RenderJob> {
  const pollMs = options.pollMs ?? POLL_MS
  const limitMs = options.limitMs ?? POLL_LIMIT_MS
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  let current = job
  let waited = 0
  while ((current.status === 'QUEUED' || current.status === 'RUNNING') && waited < limitMs) {
    await sleep(pollMs)
    waited += pollMs
    current = await getRenderJob(current.id)
  }
  return current
}
