/** Uploads endpoints. */
import { API_BASE_URL, request } from '@/src/lib/api'
import type { UploadRef } from '@/src/types/api'

/**
 * Public dev-showcase content URL (see `GET /uploads/:id/content`).
 * UUID-addressed; only local-dev uploads resolve, S3 uploads stay behind
 * the presigned flow.
 */
export function uploadContentUrl(uploadId: string): string {
  return `${API_BASE_URL}/uploads/${uploadId}/content`
}

export type LocalFile = {
  uri: string
  mimeType: string
  fileName: string
}

/**
 * Direct multipart upload to local dev storage (chat attachments).
 * Returns the READY upload row; pass its id as `imageUploadId` when sending
 * IMAGE / AUDIO messages.
 */
export async function uploadChatFile(file: LocalFile, signal?: AbortSignal): Promise<UploadRef> {
  const form = new FormData()
  form.append('file', {
    uri: file.uri,
    type: file.mimeType,
    name: file.fileName,
  } as unknown as Blob)
  return request<UploadRef>('/uploads', { method: 'POST', body: form, signal })
}
