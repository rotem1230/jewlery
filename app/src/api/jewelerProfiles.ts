/** Jeweler profile endpoints (authenticated via the session token). */
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut, buildQuery } from '@/src/lib/api'
import type {
  BusinessHour,
  DesignRequest,
  JewelerDraft,
  JewelerDraftPayload,
  JewelerProfile,
  Paginated,
  PortfolioItem,
  Region,
} from '@/src/types/api'

/** The saved draft as it would be published (`POST /jeweler-profiles/preview`). */
export type JewelerProfilePreview = {
  publishStatus: string
  businessName: string
  specialties: string[]
  bio: string | null
  phone: string | null
  email: string | null
  businessHours: BusinessHour[] | null
  serviceAreaText: string | null
  region: Region
  logoUploadId: string | null
}

/** Own business profile with portfolio + featured reviews. */
export function getMyBusinessProfile(signal?: AbortSignal): Promise<JewelerProfile | null> {
  return apiGet<JewelerProfile | null>('/jeweler-profiles/me', { signal })
}

/** Replaces the whole draft: send every field to keep (see `draftPayload` in lib/businessHours). */
export function upsertJewelerDraft(payload: {
  payload: JewelerDraftPayload
  regionId?: string
  logoUploadId?: string
}): Promise<JewelerDraft> {
  return apiPut<JewelerDraft>('/jeweler-profiles/draft', payload)
}

export function previewJewelerProfile(): Promise<JewelerProfilePreview> {
  return apiPost<JewelerProfilePreview>('/jeweler-profiles/preview', {})
}

export function publishJewelerProfile(): Promise<JewelerProfile> {
  return apiPost<JewelerProfile>('/jeweler-profiles/publish', {})
}

export function getPublicJewelerProfile(id: string, signal?: AbortSignal): Promise<JewelerProfile> {
  return apiGet<JewelerProfile>(`/jeweler-profiles/${id}`, { signal, anonymous: true })
}

/**
 * One page of the orders board, filtered on the server by this jeweler's own status (`myStatus`).
 * The `all` tab leaves out declined requests.
 */
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

/**
 * The jeweler is not taking this work request (PRD 8). 409 QUOTE_PENDING: their quote on it must
 * be withdrawn first; 409 ORDER_COMPLETED: the order is done.
 */
export function declineMyOrder(requestId: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/jeweler-profiles/me/orders/${encodeURIComponent(requestId)}/decline`, {})
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
