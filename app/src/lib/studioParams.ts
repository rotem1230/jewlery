import type { Metal, SettingItem } from '@/src/types/api'
import { NECKLACE_STYLES, necklaceStyleForLength } from '@/src/lib/necklaceLengths'

/** Reads and writes the studio's parts of design.parameters (size, metal, stones, elements…). */

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
/** One length per PRD necklace style (Choker / Princess / Matinee / Opera). */
export const NECKLACE_LENGTHS_CM: readonly number[] = NECKLACE_STYLES.map((style) => style.lengthCm)

/** Any length inside a PRD style range (an older saved 42 cm is a Princess). */
export function isNecklaceLength(value: number | undefined): value is number {
  return necklaceStyleForLength(value) !== null
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

export type BandWidthConflict = {
  settingCode: string
  settingLabel: string
  minBandWidthMm: number
  message: string
}

function formatMm(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * A ring band narrower than the chosen setting allows (`minBandWidthMm` in the settings master
 * data). The server refuses such a design; the studio warns and blocks continuing instead.
 */
export function bandWidthConflict(
  itemType: 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS',
  bandWidthMm: number,
  settingCode: string | null | undefined,
  settings: SettingItem[],
  locale = 'he',
): BandWidthConflict | null {
  if (itemType !== 'RING' || !settingCode) return null
  const setting = settings.find((item) => item.code === settingCode)
  const min = finiteNumber(setting?.minBandWidthMm)
  if (!setting || min == null || bandWidthMm >= min) return null
  const settingLabel = locale === 'en' && setting.labelEn ? setting.labelEn : setting.labelHe
  const message =
    locale === 'en'
      ? `The band (${formatMm(bandWidthMm)} mm) is narrower than the ${settingLabel} setting needs (${formatMm(min)} mm). Widen the band or pick another setting.`
      : `רוחב הטבעת (${formatMm(bandWidthMm)} מ״מ) צר מהמינימום לשיבוץ ${settingLabel} (${formatMm(min)} מ״מ). הרחיבו את הטבעת או בחרו שיבוץ אחר.`
  return { settingCode, settingLabel, minBandWidthMm: min, message }
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

/** The first stone is the centre stone; the others sit on the band (6 seats). */
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

/**
 * The parameters with a picture made by the inspiration AI as the design's inspiration picture
 * (PRD 5.4 step 7: "upload an inspiration image or generate using AI"), or null when it already
 * is. A link to a generated 3D model (an earlier version of this feature) is not kept.
 */
export function withGeneratedInspiration(
  parameters: Record<string, unknown>,
  pictureUploadId: string,
): Record<string, unknown> | null {
  if (parameters.inspirationUploadId === pictureUploadId) return null
  const next: Record<string, unknown> = { ...parameters, inspirationUploadId: pictureUploadId }
  delete next.aiOutputUploadId
  return next
}

export type StudioDrafts = {
  size?: StudioSize | null
  metal?: StudioMetal | null
  settingCode?: string | null
  stones?: StudioStone[] | null
  elements?: StudioElement[] | null
}

/**
 * The parameters the 3D viewer builds: the saved design with the open tab's unsaved choices
 * applied, in the stored parameters' shape (so the viewer runs the same geometry as exports).
 */
export function viewerParameters(
  itemType: 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS',
  parameters: Record<string, unknown> | undefined,
  drafts: StudioDrafts,
): Record<string, unknown> {
  const saved = parameters ?? {}
  const next: Record<string, unknown> = { ...saved }
  if (drafts.size) next.size = { ...(recordOf(saved.size) ?? {}), ...sizePayload(itemType, drafts.size) }
  if (drafts.metal) next.metal = { metalCode: drafts.metal.metalCode, purityCode: drafts.metal.purityCode }
  if (drafts.settingCode != null) next.setting = drafts.settingCode ? { settingCode: drafts.settingCode } : undefined
  if (drafts.stones) next.stones = drafts.stones.map((stone) => ({ stoneCode: stone.stoneCode, placement: stone.placement }))
  if (drafts.elements) {
    next.elements = drafts.elements.map((element) => ({
      elementCode: element.elementCode,
      customUploadId: element.customUploadId,
      placement: element.placement,
    }))
  }
  return next
}

/** Mean inner diameter (mm) of a ring size in the size chart, or null when the chart lacks it. */
export function ringChartDiameterMm(
  charts: Array<{ standard: string; sizeCode: string; diameterMinMm?: string | number | null; diameterMaxMm?: string | number | null }>,
  size: Pick<StudioSize, 'standard' | 'sizeCode'>,
): number | null {
  const row = charts.find((c) => c.standard === size.standard && c.sizeCode === size.sizeCode)
  const min = finiteNumber(row?.diameterMinMm)
  const max = finiteNumber(row?.diameterMaxMm)
  if (min != null && max != null) return (min + max) / 2
  return min ?? max ?? null
}
