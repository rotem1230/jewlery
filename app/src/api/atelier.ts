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

export async function getAtelierDesign(
  id: string,
  signal?: AbortSignal,
): Promise<AtelierDesign | null> {
  for (const page of [1, 2, 3]) {
    const res = await listAtelierDesigns({ page }, signal)
    const found = res.items.find((item) => item.id === id)
    if (found) return found
    if (page >= res.pagination.totalPages) break
  }
  return null
}
