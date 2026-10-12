import type { Metal } from '@/src/types/api'

/** Maps live design.parameters onto the local catalog-GLB preview. */

const METAL_HEX: Record<string, string> = {
  YELLOW_GOLD: '#E4C441',
  ROSE_GOLD: '#C76B6B',
  WHITE_GOLD: '#D8D8DE',
  SILVER: '#C5C5C5',
  PLATINUM: '#E2E2E6',
}

export const DEFAULT_BAND_WIDTH_MM = 3
export const BAND_WIDTH_MIN_MM = 0.5
export const BAND_WIDTH_MAX_MM = 15
export const NECKLACE_LENGTHS_CM = [42, 45, 50] as const

export function isNecklaceLength(value: number | undefined): value is (typeof NECKLACE_LENGTHS_CM)[number] {
  return value != null && (NECKLACE_LENGTHS_CM as readonly number[]).includes(value)
}

export const WRIST_MIN_CM = 10
export const WRIST_MAX_CM = 30
export const DEFAULT_WRIST_CM = 16.5

export type StudioSize = {
  standard?: string
  sizeCode?: string
  bandWidthMm: number
  necklaceLengthCm?: number
  wristCircumferenceCm?: number
  earringStyleCode?: string
}

export function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export function clampBandWidthMm(value: number): number {
  const stepped = Math.round(value * 10) / 10
  return Math.min(BAND_WIDTH_MAX_MM, Math.max(BAND_WIDTH_MIN_MM, stepped))
}

export function sizeFromParameters(parameters: Record<string, unknown> | undefined): StudioSize {
  const size = recordOf(parameters?.size)
  const band = finiteNumber(size?.bandWidthMm)
  const necklace = finiteNumber(size?.necklaceLengthCm)
  const wrist = finiteNumber(size?.wristCircumferenceCm)
  return {
    standard: typeof size?.standard === 'string' ? size.standard : undefined,
    sizeCode: typeof size?.sizeCode === 'string' ? size.sizeCode : undefined,
    bandWidthMm: band != null ? clampBandWidthMm(band) : DEFAULT_BAND_WIDTH_MM,
    necklaceLengthCm: necklace,
    wristCircumferenceCm: wrist,
    earringStyleCode: typeof size?.earringStyleCode === 'string' ? size.earringStyleCode : undefined,
  }
}

export function sizePayload(
  itemType: 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS',
  size: StudioSize,
): Record<string, unknown> {
  if (itemType === 'RING') {
    const payload: Record<string, unknown> = { bandWidthMm: clampBandWidthMm(size.bandWidthMm) }
    if (size.standard) payload.standard = size.standard
    if (size.sizeCode) payload.sizeCode = size.sizeCode
    return payload
  }
  if (itemType === 'NECKLACE') {
    return { necklaceLengthCm: size.necklaceLengthCm }
  }
  if (itemType === 'BRACELET') {
    return { wristCircumferenceCm: size.wristCircumferenceCm }
  }
  return size.earringStyleCode ? { earringStyleCode: size.earringStyleCode } : {}
}

export function metalHexFromCode(code: string | undefined): string {
  return METAL_HEX[code ?? ''] ?? METAL_HEX.YELLOW_GOLD
}

export function metalHexFromParameters(parameters: Record<string, unknown> | undefined): string {
  const metal = recordOf(parameters?.metal)
  const code = typeof metal?.metalCode === 'string' ? metal.metalCode : 'YELLOW_GOLD'
  return metalHexFromCode(code)
}

export function scaleFromSize(size: StudioSize): number {
  const code = size.sizeCode
  const n = typeof code === 'string' || typeof code === 'number' ? Number(code) : NaN
  if (!Number.isFinite(n)) {
    const length = Number(size.necklaceLengthCm ?? size.wristCircumferenceCm)
    if (Number.isFinite(length)) return 0.85 + Math.min(Math.max((length - 14) / 20, 0), 1) * 0.3
    return 1
  }
  if (n > 20) return 0.85 + Math.min(Math.max((n - 52) / 12, 0), 1) * 0.3
  return 0.85 + Math.min(Math.max((n - 5) / 4, 0), 1) * 0.3
}

export function scaleFromParameters(parameters: Record<string, unknown> | undefined): number {
  return scaleFromSize(sizeFromParameters(parameters))
}

/** Band tube factor so 3.0mm is the default thickness; thicker bands fatten the Band mesh. */
export function tubeFromBandWidthMm(mm: number): number {
  const width = clampBandWidthMm(mm)
  return Math.min(0.55, Math.max(0.16, 0.12 + width * 0.0667))
}

export function metalIdFromParameters(parameters: Record<string, unknown> | undefined): string {
  const metal = recordOf(parameters?.metal)
  const code = typeof metal?.metalCode === 'string' ? metal.metalCode : 'YELLOW_GOLD'
  const purity = typeof metal?.purityCode === 'string' ? metal.purityCode : '14K'
  return `${code}:${purity}`
}

export type StudioMetal = { metalCode: string; purityCode: string }

export function metalFromParameters(parameters: Record<string, unknown> | undefined): StudioMetal {
  const metal = recordOf(parameters?.metal)
  return {
    metalCode: typeof metal?.metalCode === 'string' ? metal.metalCode : 'YELLOW_GOLD',
    purityCode: typeof metal?.purityCode === 'string' ? metal.purityCode : '14K',
  }
}

export type StudioPlacement = { x: number; y: number; z: number }

export type StudioStone = {
  stoneCode: string
  placement: StudioPlacement
}

export type StudioElement = {
  elementCode?: string
  customUploadId?: string
  placement: StudioPlacement
}

export type StudioMarker = {
  kind: 'stone' | 'element'
  code?: string
  color: string
  x: number
  y: number
  z: number
}

const STONE_HEX: Record<string, string> = {
  DIAMOND: '#F5F7FF',
  SAPPHIRE: '#2B5CDE',
  RUBY: '#C41E3A',
  EMERALD: '#1F8A4C',
}

export const FALLBACK_METALS: Metal[] = [
  {
    id: 'fallback-silver',
    code: 'SILVER',
    labelHe: 'כסף',
    labelEn: 'Silver',
    purities: [{ id: 'fallback-925', metalId: 'fallback-silver', code: '925', labelHe: '925' }],
  },
  {
    id: 'fallback-yellow',
    code: 'YELLOW_GOLD',
    labelHe: 'זהב צהוב',
    labelEn: 'Yellow Gold',
    purities: [
      { id: 'fallback-yg-14', metalId: 'fallback-yellow', code: '14K', labelHe: '14K' },
      { id: 'fallback-yg-18', metalId: 'fallback-yellow', code: '18K', labelHe: '18K' },
    ],
  },
  {
    id: 'fallback-rose',
    code: 'ROSE_GOLD',
    labelHe: 'זהב ורוד',
    labelEn: 'Rose Gold',
    purities: [
      { id: 'fallback-rg-14', metalId: 'fallback-rose', code: '14K', labelHe: '14K' },
      { id: 'fallback-rg-18', metalId: 'fallback-rose', code: '18K', labelHe: '18K' },
    ],
  },
]

/** Dummy GLB has one center stone; extras are band markers (6 unique seats). */
export const STUDIO_MAX_STONES = 3
export const STUDIO_MAX_ELEMENTS = 3

export const FALLBACK_STONES: Array<{ code: string; labelHe: string; labelEn: string }> = [
  { code: 'DIAMOND', labelHe: 'יהלום', labelEn: 'Diamond' },
  { code: 'SAPPHIRE', labelHe: 'ספיר', labelEn: 'Sapphire' },
  { code: 'RUBY', labelHe: 'רובי', labelEn: 'Ruby' },
  { code: 'EMERALD', labelHe: 'ברקת', labelEn: 'Emerald' },
]

export const FALLBACK_ELEMENTS: Array<{ code: string; labelHe: string; labelEn: string }> = [
  { code: 'HEART', labelHe: 'לב', labelEn: 'Heart' },
  { code: 'STAR', labelHe: 'כוכב', labelEn: 'Star' },
  { code: 'LEAF', labelHe: 'עלה', labelEn: 'Leaf' },
  { code: 'INITIAL', labelHe: 'אות', labelEn: 'Initial' },
]

const BAND_R = 1.0
const BAND_Z = 0.14

/** Standing ring in XY (hole toward camera). Markers sit on the band, not in the hole. */
export function placementForIndex(index: number, _y?: number): StudioPlacement {
  const theta = (index / 6) * Math.PI * 2
  return { x: Math.cos(theta) * BAND_R, y: Math.sin(theta) * BAND_R, z: BAND_Z }
}

function ontoStandingBand(point: StudioPlacement): StudioPlacement {
  const oldRadial = Math.hypot(point.x, point.z)
  const theta = Math.abs(point.y) < 0.45 && oldRadial > 0.45 ? Math.atan2(point.z, point.x) : Math.atan2(point.y, point.x)
  return { x: Math.cos(theta) * BAND_R, y: Math.sin(theta) * BAND_R, z: BAND_Z }
}

function readPlacement(value: unknown, fallback: StudioPlacement): StudioPlacement {
  const record = recordOf(value)
  const x = finiteNumber(record?.x)
  const y = finiteNumber(record?.y)
  const z = finiteNumber(record?.z)
  if (x == null || y == null || z == null) return fallback
  return ontoStandingBand({ x, y, z })
}

export function stonesFromParameters(parameters: Record<string, unknown> | undefined): StudioStone[] {
  const stones = parameters?.stones
  if (!Array.isArray(stones)) return []
  return stones.flatMap((item, index) => {
    const record = recordOf(item)
    if (!record) return []
    const stoneCode = typeof record.stoneCode === 'string' ? record.stoneCode : ''
    if (!stoneCode) return []
    return [{ stoneCode, placement: readPlacement(record.placement, placementForIndex(index, 0.28)) }]
  })
}

export function elementsFromParameters(parameters: Record<string, unknown> | undefined): StudioElement[] {
  const elements = parameters?.elements
  if (!Array.isArray(elements)) return []
  return elements.flatMap((item, index) => {
    const record = recordOf(item)
    if (!record) return []
    const elementCode = typeof record.elementCode === 'string' ? record.elementCode : undefined
    const customUploadId = typeof record.customUploadId === 'string' ? record.customUploadId : undefined
    if (!elementCode && !customUploadId) return []
    return [
      {
        elementCode,
        customUploadId,
        placement: readPlacement(record.placement, placementForIndex(index, -0.12)),
      },
    ]
  })
}

export function settingCodeFromParameters(parameters: Record<string, unknown> | undefined): string | undefined {
  const setting = recordOf(parameters?.setting)
  return typeof setting?.settingCode === 'string' ? setting.settingCode : undefined
}

export function noteFromParameters(parameters: Record<string, unknown> | undefined): string {
  const note = parameters?.personalNote
  return typeof note === 'string' ? note : ''
}

export function inspirationUploadFromParameters(parameters: Record<string, unknown> | undefined): string | undefined {
  const id = parameters?.inspirationUploadId
  return typeof id === 'string' ? id : undefined
}

export function aiOutputUploadFromParameters(parameters: Record<string, unknown> | undefined): string | undefined {
  const id = parameters?.aiOutputUploadId
  return typeof id === 'string' ? id : undefined
}

export function markersFromCatalog(stones: StudioStone[], elements: StudioElement[]): StudioMarker[] {
  return [
    ...stones.map((stone) => ({
      kind: 'stone' as const,
      code: stone.stoneCode,
      color: STONE_HEX[stone.stoneCode] ?? '#B8C4FF',
      ...stone.placement,
    })),
    ...elements.map((element) => ({
      kind: 'element' as const,
      code: element.elementCode,
      color: element.customUploadId ? '#8B7CF6' : '#C9A227',
      ...element.placement,
    })),
  ]
}
