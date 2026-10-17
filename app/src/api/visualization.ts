/** Try-on: the design composed onto the designer's own photo, where they placed it. */
import { apiGet, apiGetDataUri, apiPost } from '@/src/lib/api'
import type { TryOnPlacementValue } from '@/src/lib/tryOnPlacement'

export type VisualizationJob = {
  id: string
  designId: string
  inputUploadId: string
  outputUploadId: string | null
  /** Signed link to the try-on image. */
  outputUrl?: string | null
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
}

/** Composing the picture runs in the request and can take a while on a small server. */
const TRY_ON_TIMEOUT_MS = 90_000

export function createVisualizationJob(payload: {
  designId: string
  inputUploadId: string
  placement?: TryOnPlacementValue
}): Promise<VisualizationJob> {
  return apiPost<VisualizationJob>('/visualization/jobs', payload, { timeoutMs: TRY_ON_TIMEOUT_MS })
}

/**
 * The transparent picture of my design to place over the photo, as a `data:` URI. It is served
 * only to me (bearer token), so it is fetched with the session rather than by the image view. The
 * design version is in the URL, so an edited design never gets an older picture.
 */
export function getTryOnOverlay(designId: string, version: number, signal?: AbortSignal): Promise<string> {
  return apiGetDataUri(`/visualization/designs/${designId}/overlay?v=${version}`, {
    signal,
    timeoutMs: TRY_ON_TIMEOUT_MS,
  })
}

/**
 * The signed-in user's evaluated feature flags (`GET /feature-flags`), e.g. `phase2_visualization`
 * that gates try-on.
 */
export function getFeatureFlags(signal?: AbortSignal): Promise<Record<string, boolean>> {
  return apiGet<Record<string, boolean>>('/feature-flags', { signal })
}
