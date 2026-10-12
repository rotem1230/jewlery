/** Public curated gallery (published designs). */
import { apiGet } from '@/src/lib/api'
import type { GalleryItem } from '@/src/types/api'

export function listGallery(signal?: AbortSignal): Promise<GalleryItem[]> {
  return apiGet<GalleryItem[]>('/gallery', { signal, anonymous: true })
}
