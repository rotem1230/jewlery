/** Public atelier + design-request endpoints. */
import { apiGet, apiPost, buildQuery } from '@/src/lib/api'
import type { AtelierBanner, AtelierDesign, AtelierJeweler, DesignRequest, Paginated } from '@/src/types/api'

export function listAtelierDesigns(
  params?: { q?: string; regionId?: string; page?: number },
  signal?: AbortSignal,
): Promise<Paginated<AtelierDesign>> {
  return apiGet<Paginated<AtelierDesign>>(`/atelier/designs${buildQuery(params ?? {})}`, {
    signal,
    anonymous: true,
  })
}

export function listAtelierJewelers(
  params?: { q?: string; regionId?: string; page?: number },
  signal?: AbortSignal,
): Promise<Paginated<AtelierJeweler>> {
  return apiGet<Paginated<AtelierJeweler>>(`/atelier/jewelers${buildQuery(params ?? {})}`, {
    signal,
    anonymous: true,
  })
}

export function listAtelierGeoSearch(
  params: { lat: number; lng: number; radiusKm: number; page?: number },
  signal?: AbortSignal,
): Promise<Paginated<AtelierJeweler>> {
  return apiGet<Paginated<AtelierJeweler>>(`/atelier/geo/search${buildQuery(params)}`, {
    signal,
    anonymous: true,
  })
}

export function createAtelierRequest(payload: {
  designId: string
  mode: 'TARGETED' | 'BROADCAST'
  targetJewelerProfileIds?: string[]
  message?: string
}): Promise<DesignRequest> {
  return apiPost<DesignRequest>('/atelier/requests', payload)
}

export function getAtelierRequest(id: string, signal?: AbortSignal): Promise<DesignRequest> {
  return apiGet<DesignRequest>(`/atelier/requests/${id}`, { signal })
}

export function listAtelierBanners(signal?: AbortSignal): Promise<AtelierBanner[]> {
  return apiGet<AtelierBanner[]>('/atelier/banners', { signal, anonymous: true })
}

/**
 * One live listing by id. Rejects with a 404 ApiError once the listing is not live any more
 * (expired, unpublished, completed or removed) — see `isNotFound` in lib/atelierView.
 */
export function getAtelierDesign(id: string, signal?: AbortSignal): Promise<AtelierDesign> {
  return apiGet<AtelierDesign>(`/atelier/designs/${encodeURIComponent(id)}`, {
    signal,
    anonymous: true,
  })
}
