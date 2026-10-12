/** POST /render-jobs — STL / HD export. Not Tripo. */
import { apiPost } from '@/src/lib/api'

export type RenderExportFormat = 'STL' | 'OBJ' | 'STEP' | 'PNG_HD'

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

export function createRenderJob(payload: {
  designId: string
  exportFormat: RenderExportFormat
}): Promise<RenderJob> {
  return apiPost<RenderJob>('/render-jobs', payload)
}
