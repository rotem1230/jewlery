/** Catalog lookups (public). */
import { ApiError, apiGet, buildQuery } from '@/src/lib/api'
import type {
  ElementItem,
  ItemType,
  MeasurementGuide,
  Metal,
  Region,
  SettingItem,
  SizeChartRow,
  StoneItem,
} from '@/src/types/api'

export type JewelryItemCode = 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS'

export const CATEGORY_CODE: Record<string, JewelryItemCode> = {
  ring: 'RING',
  necklace: 'NECKLACE',
  bracelet: 'BRACELET',
  earrings: 'EARRINGS',
}

export function listItemTypes(signal?: AbortSignal): Promise<ItemType[]> {
  return apiGet<ItemType[]>('/master-data/item-types', { signal, anonymous: true })
}

export function listRegions(signal?: AbortSignal): Promise<Region[]> {
  return apiGet<Region[]>('/master-data/regions', { signal, anonymous: true })
}

export function listMetals(signal?: AbortSignal): Promise<Metal[]> {
  return apiGet<Metal[]>('/master-data/metals', { signal, anonymous: true })
}

export function listSettings(signal?: AbortSignal): Promise<SettingItem[]> {
  return apiGet<SettingItem[]>('/master-data/settings', { signal, anonymous: true })
}

export function listStones(signal?: AbortSignal): Promise<StoneItem[]> {
  return apiGet<StoneItem[]>('/master-data/stones', { signal, anonymous: true })
}

export function listElements(signal?: AbortSignal): Promise<ElementItem[]> {
  return apiGet<ElementItem[]>('/master-data/elements', { signal, anonymous: true })
}

export function listWizardSizeCharts(
  itemTypeCode: JewelryItemCode,
  signal?: AbortSignal,
): Promise<SizeChartRow[]> {
  return apiGet<SizeChartRow[]>(`/wizard/size-charts/${itemTypeCode}`, {
    signal,
    anonymous: true,
  })
}

export async function getMeasurementGuide(
  itemTypeId: string,
  locale?: string,
  signal?: AbortSignal,
): Promise<MeasurementGuide | null> {
  try {
    return await apiGet<MeasurementGuide>(
      `/master-data/measurement-guides/${itemTypeId}${buildQuery({ locale })}`,
      { signal, anonymous: true },
    )
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function itemTypeIdForCategory(
  category: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const types = await listItemTypes(signal)
  const code = CATEGORY_CODE[category]
  return types.find((item) => item.code === code)?.id ?? null
}

export type MetalChoice = {
  id: string
  label: string
  metalCode: string
  purityCode: string
}

export function metalChoices(metals: Metal[], locale: string): MetalChoice[] {
  return metals.flatMap((metal) => {
    const name = locale === 'en' && metal.labelEn ? metal.labelEn : metal.labelHe
    const purities = metal.purities.length
      ? metal.purities
      : [{ id: metal.id, metalId: metal.id, code: '14K', labelHe: null }]
    return purities.map((purity) => ({
      id: `${metal.code}:${purity.code}`,
      label: `${name} ${purity.code}`.trim(),
      metalCode: metal.code,
      purityCode: purity.code,
    }))
  })
}

export function parseMetalChoice(id: string): { metalCode: string; purityCode: string } {
  const [metalCode, purityCode] = id.split(':')
  return {
    metalCode: metalCode || 'YELLOW_GOLD',
    purityCode: purityCode || '14K',
  }
}

export function measurementGuideTips(body: unknown): string[] {
  if (!body || typeof body !== 'object') return []
  const tips = (body as { tips?: unknown }).tips
  if (!Array.isArray(tips)) return []
  return tips.filter((tip): tip is string => typeof tip === 'string' && tip.trim().length > 0)
}

/**
 * Guide table rows `{standard, sizeCode, us?, diameterMm}`; `us` is the paired US size of an IL
 * row and `diameterMm` may be a range ("16.55–16.95").
 */
export function measurementGuideTable(
  body: unknown,
): Array<{ standard?: string; sizeCode: string; us?: string; diameterMm: string }> {
  if (!body || typeof body !== 'object') return []
  const table = (body as { table?: unknown }).table
  if (!Array.isArray(table)) return []
  return table.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const record = row as Record<string, unknown>
    const sizeCode = typeof record.sizeCode === 'string' ? record.sizeCode : ''
    if (!sizeCode) return []
    return [
      {
        standard: typeof record.standard === 'string' ? record.standard : undefined,
        sizeCode,
        us: typeof record.us === 'string' && record.us.trim() ? record.us : undefined,
        diameterMm: String(record.diameterMm ?? ''),
      },
    ]
  })
}
