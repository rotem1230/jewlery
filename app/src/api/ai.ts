/** POST /ai/inspiration and GET /ai/jobs/:id. Size/metal/setting/stone never call this. */
import { apiGet, apiPost } from '@/src/lib/api'

export type AiJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export type AiGenerationJob = {
  id: string
  designId: string | null
  prompt: string
  status: AiJobStatus
  outputUploadId: string | null
  errorMessage: string | null
}

export function createInspiration(payload: { designId?: string; prompt: string }): Promise<AiGenerationJob> {
  return apiPost<AiGenerationJob>('/ai/inspiration', payload)
}

export function getAiJob(id: string): Promise<AiGenerationJob> {
  return apiGet<AiGenerationJob>(`/ai/jobs/${id}`)
}
