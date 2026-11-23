/** Designs endpoints (authenticated). */
import { apiGet, apiPatch, apiPost, buildQuery } from '@/src/lib/api'
import type { DesignDetail, DesignListResponse, DesignStatus } from '@/src/types/api'

export type DesignSort = 'newest' | 'oldest' | 'updated' | 'title'

export function listDesigns(
  params?: { status?: DesignStatus; page?: number; sort?: DesignSort },
  signal?: AbortSignal,
): Promise<DesignListResponse> {
  return apiGet<DesignListResponse>(`/designs${buildQuery(params ?? {})}`, { signal })
}

export function getDesign(id: string, signal?: AbortSignal): Promise<DesignDetail> {
  return apiGet<DesignDetail>(`/designs/${id}`, { signal })
}

/**
 * A quote of one of my designs, as `GET /designs/:id/quotes` lists it (newest first). A pending
 * quote past its validity already comes back as EXPIRED.
 */
export type DesignQuote = {
  id: string
  conversationId: string
  designRequestId: string | null
  /** PENDING | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN */
  status: string
  materialsCost: string | number
  laborCost: string | number
  totalPrice: string | number
  currency: string
  etaBusinessDays: number
  notes: string | null
  validUntil: string | null
  acceptedAt: string | null
  declinedAt: string | null
  createdAt: string
  author: { id: string; firstName: string | null; lastName: string | null; businessName?: string | null } | null
}

/** Every quote the design received (design owner only). */
export function listDesignQuotes(designId: string, signal?: AbortSignal): Promise<DesignQuote[]> {
  return apiGet<DesignQuote[]>(`/designs/${designId}/quotes`, { signal })
}

export function createDesign(payload: {
  itemTypeId: string
  title?: string
  preferredRegionId?: string
  parameters?: Record<string, unknown>
}): Promise<DesignDetail> {
  return apiPost<DesignDetail>('/designs', payload)
}

export function updateDesign(
  id: string,
  payload: {
    version: number
    title?: string
    description?: string
    parameters?: Record<string, unknown>
    jewelerNotes?: string
    /** Atelier region filter (PRD 5.5); the server checks the id. */
    preferredRegionId?: string
  },
): Promise<DesignDetail> {
  return apiPatch<DesignDetail>(`/designs/${id}`, payload)
}

export function lockDesign(
  id: string,
  payload: { fields: string[]; confirm: true },
): Promise<DesignDetail> {
  return apiPost<DesignDetail>(`/designs/${id}/lock`, payload)
}

/**
 * Opens fields the designer locked earlier (an older studio offered to lock the size): the
 * designer's own design, while it is not completed.
 */
export function unlockDesign(id: string, payload: { fields: string[] }): Promise<DesignDetail> {
  return apiPost<DesignDetail>(`/designs/${id}/unlock`, payload)
}

export function transitionDesign(id: string, toStatus: DesignStatus): Promise<DesignDetail> {
  return apiPost<DesignDetail>(`/designs/${id}/transition`, { toStatus })
}

export function duplicateDesign(id: string): Promise<DesignDetail> {
  return apiPost<DesignDetail>(`/designs/${id}/duplicate`, {})
}
