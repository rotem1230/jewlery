/** Jeweler profile endpoints (authenticated via the session token). */
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut, buildQuery } from '@/src/lib/api'
import type {
  DesignRequest,
  JewelerDraft,
  JewelerProfile,
  Paginated,
  PortfolioItem,
} from '@/src/types/api'

/** Own business profile with portfolio + featured reviews. */
export function getMyBusinessProfile(signal?: AbortSignal): Promise<JewelerProfile | null> {
  return apiGet<JewelerProfile | null>('/jeweler-profiles/me', { signal })
}

export function upsertJewelerDraft(payload: {
  payload: {
    businessName?: string
    bio?: string
    phone?: string
    email?: string
    specialties?: string[]
  }
  regionId?: string
  logoUploadId?: string
}): Promise<JewelerDraft> {
  return apiPut<JewelerDraft>('/jeweler-profiles/draft', payload)
}

export function previewJewelerProfile(): Promise<unknown> {
  return apiPost('/jeweler-profiles/preview', {})
}

export function publishJewelerProfile(): Promise<JewelerProfile> {
  return apiPost<JewelerProfile>('/jeweler-profiles/publish', {})
}

export function getPublicJewelerProfile(id: string, signal?: AbortSignal): Promise<JewelerProfile> {
  return apiGet<JewelerProfile>(`/jeweler-profiles/${id}`, { signal, anonymous: true })
}

export async function getMyOrders(
  params?: { tab?: 'all' | 'quote_submitted' | 'negotiating' | 'completed'; page?: number },
  signal?: AbortSignal,
): Promise<Paginated<DesignRequest>> {
  try {
    return await apiGet<Paginated<DesignRequest>>(
      `/jeweler-profiles/me/orders${buildQuery(params ?? {})}`,
      { signal },
    )
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return {
        items: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      }
    }
    throw err
  }
}

export function addPortfolioItem(payload: {
  uploadId: string
  title?: string
  sortOrder?: number
}): Promise<PortfolioItem> {
  return apiPost<PortfolioItem>('/jeweler-profiles/me/portfolio', payload)
}

export function updatePortfolioItem(
  itemId: string,
  payload: { title?: string; isSelectedWork?: boolean },
): Promise<PortfolioItem> {
  return apiPatch<PortfolioItem>(`/jeweler-profiles/me/portfolio/${itemId}`, payload)
}

export function removePortfolioItem(itemId: string): Promise<unknown> {
  return apiDelete(`/jeweler-profiles/me/portfolio/${itemId}`)
}
