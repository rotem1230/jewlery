/** Designs endpoints (authenticated). */
import { apiGet, apiPatch, apiPost, buildQuery } from '@/src/lib/api'
import type { DesignDetail, DesignListResponse, DesignStatus } from '@/src/types/api'

export function listDesigns(
  params?: { status?: DesignStatus; page?: number },
  signal?: AbortSignal,
): Promise<DesignListResponse> {
  return apiGet<DesignListResponse>(`/designs${buildQuery(params ?? {})}`, { signal })
}

export function getDesign(id: string, signal?: AbortSignal): Promise<DesignDetail> {
  return apiGet<DesignDetail>(`/designs/${id}`, { signal })
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

export function transitionDesign(id: string, toStatus: DesignStatus): Promise<DesignDetail> {
  return apiPost<DesignDetail>(`/designs/${id}/transition`, { toStatus })
}

export function duplicateDesign(id: string): Promise<DesignDetail> {
  return apiPost<DesignDetail>(`/designs/${id}/duplicate`, {})
}
