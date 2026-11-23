/**
 * Ring sizes (PRD 5.4): the server chart lists IL and US rows of the same size with the same
 * `sortOrder`; they are shown as one row per size — "52 · US 6.00 · 16.55–16.95 מ״מ" — and the IL
 * standard / size code is what the design saves. Every size 44–70 is offered, and a size of one's
 * own can be typed in (the client's notes of 23.11).
 */
import type { SizeChartRow } from '@/src/types/api'
import { CUSTOM_RING_SIZE_MAX_IL, CUSTOM_RING_SIZE_MIN_IL, RING_SIZE_CHART } from '@/src/lib/jewelryCatalog.generated'

export type RingSizeOption = {
  id: string
  /** Saved into design.parameters.size. */
  standard: string
  sizeCode: string
  /** The size shown large on the row (IL when the pair has one). */
  size: string
  /** "US 6.00", or null when the size has no US pair. */
  us: string | null
  /** "16.55–16.95" or "17.19" (millimetres). */
  diameter: string
  label: string
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Inner diameter in mm with two decimals; a range only when min and max differ. */
export function formatDiameterMm(min: string | number | null | undefined, max: string | number | null | undefined): string {
  const low = toNumber(min)
  const high = toNumber(max)
  if (low === null && high === null) return ''
  if (low === null || high === null || low === high) return (low ?? high ?? 0).toFixed(2)
  return `${low.toFixed(2)}–${high.toFixed(2)}`
}

const PRIMARY_STANDARD = 'IL'

export function ringSizeOptions(charts: SizeChartRow[]): RingSizeOption[] {
  const groups = new Map<number, SizeChartRow[]>()
  for (const row of charts) {
    const group = groups.get(row.sortOrder)
    if (group) group.push(row)
    else groups.set(row.sortOrder, [row])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, rows]) => {
      const primary = rows.find((row) => row.standard === PRIMARY_STANDARD) ?? rows[0]
      if (!primary) return []
      const usRow = rows.find((row) => row.standard === 'US' && row !== primary)
      const us = usRow ? `US ${usRow.sizeCode}` : null
      const size = primary.standard === PRIMARY_STANDARD ? primary.sizeCode : `${primary.standard} ${primary.sizeCode}`
      const diameter = formatDiameterMm(primary.diameterMinMm, primary.diameterMaxMm)
      return [
        {
          // By size, not row id: a size picked from the offline chart stays picked once the server's arrives.
          id: `${primary.standard}:${primary.sizeCode}`,
          standard: primary.standard,
          sizeCode: primary.sizeCode,
          size,
          us,
          diameter,
          label: [size, us, diameter ? `${diameter} מ״מ` : null].filter(Boolean).join(' · '),
        },
      ]
    })
}

/** "Standard size": the size a design is made in when the designer does not pick one. */
export const STANDARD_RING_SIZE = { standard: 'IL', sizeCode: '52' } as const

/** Inner diameter (mm) of an Israeli size: the size is the inner circumference in millimetres. */
export function ilDiameterMm(size: number): number {
  return size / Math.PI
}

/**
 * The full chart (the shared catalogue's, the same the server seeds): one IL row and its US pair
 * per size 44–70, the PRD sizes as the PRD gives them. Used when the server chart cannot be loaded
 * (offline) or is empty.
 */
export const RING_SIZE_FALLBACK: SizeChartRow[] = RING_SIZE_CHART.flatMap((size, index) => [
  { id: `fallback-il-${size.il}`, itemTypeId: 'RING', standard: 'IL', sizeCode: size.il, diameterMinMm: size.minMm, diameterMaxMm: size.maxMm, sortOrder: index },
  { id: `fallback-us-${size.us}`, itemTypeId: 'RING', standard: 'US', sizeCode: size.us, diameterMinMm: size.minMm, diameterMaxMm: size.maxMm, sortOrder: index },
])

/**
 * A size typed by hand ("53.5", "53,5"): an Israeli size 38–80, to one decimal; null when it is
 * not one.
 */
export function customRingSize(text: string): { standard: 'IL'; sizeCode: string } | null {
  const cleaned = text.trim().replace(',', '.')
  if (!/^\d{2}(\.\d)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < CUSTOM_RING_SIZE_MIN_IL || n > CUSTOM_RING_SIZE_MAX_IL) return null
  return { standard: 'IL', sizeCode: String(n) }
}

/** "53.5 · 17.03 מ״מ" for an Israeli size, "US 7.00" for another standard. */
export function ringSizeLabel(size: { standard?: string; sizeCode?: string }): string {
  if (!size.sizeCode) return ''
  if (size.standard && size.standard !== PRIMARY_STANDARD) return `${size.standard} ${size.sizeCode}`
  const n = toNumber(size.sizeCode)
  return n === null ? size.sizeCode : `${size.sizeCode} · ${ilDiameterMm(n).toFixed(2)} מ״מ`
}
