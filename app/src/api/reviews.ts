/** Reviews endpoints. */
import { apiGet, apiPatch, apiPost, buildQuery } from '@/src/lib/api'
import type { JewelerReview, Paginated } from '@/src/types/api'

export function createReview(payload: {
  jewelerProfileId: string
  reviewerName: string
  rating: number
  comment: string
}): Promise<JewelerReview> {
  return apiPost<JewelerReview>('/reviews', payload)
}

export function listReviews(
  jewelerProfileId: string,
  signal?: AbortSignal,
): Promise<Paginated<JewelerReview>> {
  return apiGet<Paginated<JewelerReview>>(
    `/reviews${buildQuery({ jewelerProfileId })}`,
    { signal, anonymous: true },
  )
}

/** The signed-in jeweler's own reviews, listed whether or not the profile is published. */
export function listMyReviews(signal?: AbortSignal): Promise<Paginated<JewelerReview>> {
  return apiGet<Paginated<JewelerReview>>('/reviews/mine', { signal })
}

export function featureReview(id: string, isFeatured: boolean): Promise<JewelerReview> {
  return apiPatch<JewelerReview>(`/reviews/${id}/feature`, { isFeatured })
}
