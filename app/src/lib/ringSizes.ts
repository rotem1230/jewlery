/**
 * Ring sizes (PRD 5.4): the server chart lists IL and US rows of the same size with the same
 * `sortOrder`; they are shown as one row per size — "52 · US 6.00 · 16.55–16.95 מ״מ" — and the IL
 * standard / size code is what the design saves.
 */
import type { SizeChartRow } from '@/src/types/api'

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

const PRD_RING_SIZES: Array<{ il: string; us: string; min: number; max: number }> = [
  { il: '52', us: '6.00', min: 16.55, max: 16.95 },
  { il: '54', us: '7.00', min: 17.19, max: 17.19 },
  { il: '56', us: '7.75', min: 17.83, max: 17.83 },
  { il: '58', us: '8.50', min: 18.47, max: 18.47 },
  { il: '60', us: '9.25', min: 19.1, max: 19.1 },
  { il: '62', us: '10.00', min: 19.76, max: 19.76 },
  { il: '64', us: '10.75', min: 20.4, max: 20.44 },
]

/** The PRD chart, used only when the server chart cannot be loaded (offline). */
export const RING_SIZE_FALLBACK: SizeChartRow[] = PRD_RING_SIZES.flatMap((size, index) => [
  {
    id: `fallback-il-${size.il}`,
    itemTypeId: 'RING',
    standard: 'IL',
    sizeCode: size.il,
    diameterMinMm: size.min,
    diameterMaxMm: size.max,
    sortOrder: index,
  },
  {
    id: `fallback-us-${size.us}`,
    itemTypeId: 'RING',
    standard: 'US',
    sizeCode: size.us,
    diameterMinMm: size.min,
    diameterMaxMm: size.max,
    sortOrder: index,
  },
])
