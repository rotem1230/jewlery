/** POST /visualization/jobs — try-on selfie. Not Tripo. */
import { apiGet, apiPost } from '@/src/lib/api'

export type VisualizationJob = {
  id: string
  designId: string
  inputUploadId: string
  outputUploadId: string | null
  /** Signed link to the try-on image. */
  outputUrl?: string | null
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
}

export function createVisualizationJob(payload: {
  designId: string
  inputUploadId: string
}): Promise<VisualizationJob> {
  return apiPost<VisualizationJob>('/visualization/jobs', payload)
}

/**
 * The signed-in user's evaluated feature flags (`GET /feature-flags`), e.g. `phase2_visualization`
 * that gates try-on.
 */
export function getFeatureFlags(signal?: AbortSignal): Promise<Record<string, boolean>> {
  return apiGet<Record<string, boolean>>('/feature-flags', { signal })
}
