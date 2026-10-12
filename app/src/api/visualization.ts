/** POST /visualization/jobs — try-on selfie. Not Tripo. */
import { apiPost } from '@/src/lib/api'

export type VisualizationJob = {
  id: string
  designId: string
  inputUploadId: string
  outputUploadId: string | null
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
}

export function createVisualizationJob(payload: {
  designId: string
  inputUploadId: string
}): Promise<VisualizationJob> {
  return apiPost<VisualizationJob>('/visualization/jobs', payload)
}
