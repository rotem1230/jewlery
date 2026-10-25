import type { Metal, SettingItem } from '@/src/types/api'
import { NECKLACE_STYLES, necklaceStyleForLength } from '@/src/lib/necklaceLengths'
import {
  BAND_STONE_SIZES_MM,
  CHAIN_BOTTOM_DEG,
  EARRING_ORBIT_MAX_MM,
  LEGACY_SETTINGS,
  MAX_ROTATION_DEG,
  RING_TOP_DEG,
  STONE_MIN_MM,
  allowedCuts,
  bandWidthForStonesMm,
  caratEstimate,
  elementDef,
  elementText,
  paletteColor,
  placementControls,
  settingDef,
  stoneDef,
  stoneMaxMm,
  type CutCode,
  type PlacementControls,
} from '@/src/lib/jewelryCatalog.generated'

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
  itemType: StudioItemType,
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

export type StudioItemType = 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS'

/** Most stones / elements the studio adds to one piece (the server builds up to 12 / 6). */
export const STUDIO_MAX_STONES = 6
export const STUDIO_MAX_ELEMENTS = 6

/**
 * Where an item sits on the piece: the angle along it (degrees; null = the automatic place the
 * geometry gives it, as older designs have), across a ring band / from an earring's centre (mm),
 * and its own turn (degrees).
 */
export type StudioPlacement = { angleDeg: number | null; offsetMm: number; rotationDeg: number }

export const AUTO_PLACEMENT: StudioPlacement = { angleDeg: null, offsetMm: 0, rotationDeg: 0 }

export type StudioStone = {
  stoneCode: string
  cutCode: CutCode
  /** A colour of the client's chart (any colour, any stone). */
  colorCode: string
  /** Girdle diameter (the longest side of an oval / emerald cut); null = the size for its place. */
  sizeMm: number | null
  placement: StudioPlacement
}

export type StudioElement = {
  elementCode?: string
  customUploadId?: string
  /** Letters / digits of a text element. */
  text?: string
  variant?: string
  /** The longest side (mm); null = the size for its place. */
  sizeMm: number | null
  placement: StudioPlacement
}

/** A band setting: rows of stones along the ring band (the pavé table sizes). */
export type StudioBand = {
  settingCode: string
  stoneCode: string
  colorCode: string
  stoneSizeMm: number
  rows: number
  /** Stones per row; null = as many as suit the band. */
  count: number | null
  /** The row's centre on the band. */
  angleDeg: number
}

export type StudioSetting = {
  /** The centre stone's head; 'NONE' = no head; '' = not chosen (a ring's stone gets a basket). */
  headCode: string
  band: StudioBand | null
}

const round1 = (value: number) => Math.round(value * 10) / 10

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalDeg(value: number): number {
  return ((value % 360) + 360) % 360
}

function readStudioPlacement(value: unknown): StudioPlacement {
  const p = recordOf(value)
  const angle = finiteNumber(p?.angleDeg)
  return {
    // Older x / y / z placements were the automatic seats: they stay automatic.
    angleDeg: angle != null ? normalDeg(angle) : null,
    offsetMm: clampNumber(finiteNumber(p?.offsetMm) ?? 0, -EARRING_ORBIT_MAX_MM, EARRING_ORBIT_MAX_MM),
    rotationDeg: clampNumber(finiteNumber(p?.rotationDeg) ?? 0, -MAX_ROTATION_DEG, MAX_ROTATION_DEG),
  }
}

/** The stored placement: the angle only once the user placed the item. */
export function placementPayload(placement: StudioPlacement): Record<string, number> {
  const rest = { offsetMm: round1(placement.offsetMm), rotationDeg: round1(placement.rotationDeg) }
  return placement.angleDeg != null ? { angleDeg: round1(placement.angleDeg), ...rest } : rest
}

/** A stone's chart colour: the saved one, else the stone's own. */
function stoneColorCode(stoneCode: string, colorCode: unknown): string {
  const chosen = paletteColor(typeof colorCode === 'string' ? colorCode.toUpperCase() : null)
  return chosen?.code ?? stoneDef(stoneCode)?.defaultColor ?? 'CRYSTAL'
}

/** The cut: the saved one when the stone comes in it, else the stone's first. */
function stoneCut(stoneCode: string, asked: unknown): CutCode {
  const cuts = allowedCuts(stoneCode)
  const cut = typeof asked === 'string' ? asked.toUpperCase() : ''
  return (cuts as string[]).includes(cut) ? (cut as CutCode) : cuts[0]
}

/** A stone from 2 mm up to 1.5 ct in its cut. */
export function stoneSizeRange(stoneCode: string, cutCode: CutCode): { min: number; max: number } {
  return { min: STONE_MIN_MM, max: stoneMaxMm(stoneCode, cutCode) }
}

/** "≈ 1.06 קראט" / "≈ 1.06 ct": the estimated weight of a stone. */
export function caratLabel(stoneCode: string, cutCode: CutCode, sizeMm: number, locale = 'he'): string {
  const ct = caratEstimate(stoneCode, cutCode, sizeMm).toFixed(2)
  return locale === 'en' ? `≈ ${ct} ct` : `≈ ${ct} קראט`
}

/** The size a new stone starts with: a centre stone or pendant, or a smaller accent. */
function newStoneSizeMm(itemType: StudioItemType, index: number, stoneCode: string, cutCode: CutCode): number {
  const chain = itemType === 'NECKLACE' || itemType === 'BRACELET'
  const wanted = index > 0 ? (chain ? 3 : 2.5) : itemType === 'NECKLACE' ? 6 : 5
  const { min, max } = stoneSizeRange(stoneCode, cutCode)
  return clampNumber(wanted, min, max)
}

export function stonesFromParameters(parameters: Record<string, unknown> | undefined): StudioStone[] {
  const stones = parameters?.stones
  if (!Array.isArray(stones)) return []
  return stones.flatMap((item) => {
    const record = recordOf(item)
    const stoneCode = typeof record?.stoneCode === 'string' ? record.stoneCode : ''
    if (!record || !stoneCode) return []
    const cutCode = stoneCut(stoneCode, record.cutCode ?? record.shape)
    const size = finiteNumber(record.sizeMm)
    const { min, max } = stoneSizeRange(stoneCode, cutCode)
    return [
      {
        stoneCode,
        cutCode,
        colorCode: stoneColorCode(stoneCode, record.colorCode),
        sizeMm: size != null ? clampNumber(size, min, max) : null,
        placement: readStudioPlacement(record.placement),
      },
    ]
  })
}

/** The list with a new stone of `stoneCode`, in its own colour and first cut. */
export function addStone(itemType: StudioItemType, list: StudioStone[], stoneCode: string): StudioStone[] {
  if (list.length >= STUDIO_MAX_STONES) return list
  const cutCode = stoneCut(stoneCode, null)
  return [
    ...list,
    {
      stoneCode,
      cutCode,
      colorCode: stoneColorCode(stoneCode, null),
      sizeMm: newStoneSizeMm(itemType, list.length, stoneCode, cutCode),
      placement: { ...AUTO_PLACEMENT },
    },
  ]
}

/** The stone as another kind of stone: in its own colour, the cut and size kept when it allows them. */
export function withStoneCode(stone: StudioStone, stoneCode: string): StudioStone {
  const cutCode = stoneCut(stoneCode, stone.cutCode)
  const { min, max } = stoneSizeRange(stoneCode, cutCode)
  return {
    ...stone,
    stoneCode,
    cutCode,
    colorCode: stoneColorCode(stoneCode, null),
    sizeMm: stone.sizeMm != null ? clampNumber(stone.sizeMm, min, max) : null,
  }
}

/** The stone in another cut (its size kept inside the new cut's 1.5 ct). */
export function withCut(stone: StudioStone, cutCode: CutCode): StudioStone {
  const { min, max } = stoneSizeRange(stone.stoneCode, cutCode)
  return { ...stone, cutCode, sizeMm: stone.sizeMm != null ? clampNumber(stone.sizeMm, min, max) : null }
}

export function stonePayload(stone: StudioStone): Record<string, unknown> {
  const payload: Record<string, unknown> = { stoneCode: stone.stoneCode, cutCode: stone.cutCode, colorCode: stone.colorCode }
  if (stone.sizeMm != null) payload.sizeMm = round1(stone.sizeMm)
  payload.placement = placementPayload(stone.placement)
  return payload
}

/** The size a new element starts with where it goes, inside the sheet's range for it. */
function newElementSizeMm(
  itemType: StudioItemType,
  elementCode: string | undefined,
  index: number,
  stones: number,
  bandWidthMm: number,
): number | null {
  const def = elementDef(elementCode)
  if (!def) return null
  let wanted: number
  if (itemType === 'RING') wanted = clampNumber(bandWidthMm * 1.4, 3.5, 8)
  else if (itemType === 'EARRINGS') wanted = index === 0 && stones === 0 ? 8 : 5
  else if (index === 0 && stones === 0) wanted = itemType === 'NECKLACE' ? 11 : 8
  else wanted = itemType === 'NECKLACE' ? 8 : 6.5
  return clampNumber(wanted, def.minMm, def.maxMm)
}

/** Keys in one order: what is stored, shown and compared. */
function elementOf(parts: Omit<StudioElement, 'sizeMm' | 'placement'>, sizeMm: number | null, placement: StudioPlacement): StudioElement {
  const element = {} as StudioElement
  if (parts.elementCode !== undefined) element.elementCode = parts.elementCode
  if (parts.customUploadId !== undefined) element.customUploadId = parts.customUploadId
  if (parts.text !== undefined) element.text = parts.text
  if (parts.variant !== undefined) element.variant = parts.variant
  element.sizeMm = sizeMm
  element.placement = placement
  return element
}

export function elementsFromParameters(parameters: Record<string, unknown> | undefined): StudioElement[] {
  const elements = parameters?.elements
  if (!Array.isArray(elements)) return []
  return elements.flatMap((item) => {
    const record = recordOf(item)
    if (!record) return []
    const elementCode = typeof record.elementCode === 'string' ? record.elementCode : undefined
    const customUploadId = typeof record.customUploadId === 'string' ? record.customUploadId : undefined
    if (!elementCode && !customUploadId) return []
    // The round initial of older designs keeps its code (it has no catalogue entry of its own).
    const def = elementCode === 'INITIAL' ? null : elementDef(elementCode)
    const text = def?.text ? elementText(def, record.text) : undefined
    const variant =
      def && def.variants.length
        ? typeof record.variant === 'string' && def.variants.includes(record.variant)
          ? record.variant
          : def.variants[0]
        : undefined
    const size = finiteNumber(record.sizeMm)
    const sizeMm = size == null ? null : def ? clampNumber(size, def.minMm, def.maxMm) : size
    return [elementOf({ elementCode, customUploadId, text, variant }, sizeMm, readStudioPlacement(record.placement))]
  })
}

/** The list with a new catalogue element (its first style, an empty text) or an uploaded picture. */
export function addElement(
  itemType: StudioItemType,
  list: StudioElement[],
  item: { elementCode?: string; customUploadId?: string },
  bandWidthMm: number,
  stones = 0,
): StudioElement[] {
  if (list.length >= STUDIO_MAX_ELEMENTS) return list
  const def = elementDef(item.elementCode)
  return [
    ...list,
    elementOf(
      {
        elementCode: item.elementCode,
        customUploadId: item.customUploadId,
        text: def?.text ? '' : undefined,
        variant: def?.variants.length ? def.variants[0] : undefined,
      },
      newElementSizeMm(itemType, item.elementCode, list.length, stones, bandWidthMm),
      { ...AUTO_PLACEMENT },
    ),
  ]
}

export function elementPayload(element: StudioElement): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (element.elementCode) payload.elementCode = element.elementCode
  if (element.customUploadId) payload.customUploadId = element.customUploadId
  if (element.text !== undefined) payload.text = element.text
  if (element.variant) payload.variant = element.variant
  if (element.sizeMm != null) payload.sizeMm = round1(element.sizeMm)
  payload.placement = placementPayload(element.placement)
  return payload
}

/** The list with the `index`th item put where the user dragged it on the model (its turn kept). */
export function withDraggedPlacement<T extends { placement: StudioPlacement }>(
  list: T[],
  index: number,
  point: { angleDeg: number; offsetMm: number },
): T[] {
  if (index < 0 || index >= list.length) return list
  return list.map((item, i) =>
    i === index
      ? {
          ...item,
          placement: {
            ...item.placement,
            angleDeg: round1(normalDeg(point.angleDeg)),
            // An earring item dragged far out stops at the farthest place the server accepts.
            offsetMm: round1(clampNumber(point.offsetMm, -EARRING_ORBIT_MAX_MM, EARRING_ORBIT_MAX_MM)),
          },
        }
      : item,
  )
}

// ---------------------------------------------------------------------------------------------
// The setting: the centre stone's head and the band setting
// ---------------------------------------------------------------------------------------------

function bandFromRecord(band: Record<string, unknown>, settingCode: string): StudioBand {
  const def = settingDef(settingCode)
  const stoneCode = stoneDef(band.stoneCode)?.code ?? 'DIAMOND'
  const size = finiteNumber(band.stoneSizeMm) ?? 1.5
  const stoneSizeMm = BAND_STONE_SIZES_MM.reduce(
    (best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best),
    BAND_STONE_SIZES_MM[0],
  )
  const rows = Math.round(finiteNumber(band.rows) ?? def?.minRows ?? 1)
  const count = finiteNumber(band.count)
  const angle = finiteNumber(recordOf(band.placement)?.angleDeg)
  return {
    settingCode,
    stoneCode,
    colorCode: stoneColorCode(stoneCode, band.colorCode),
    stoneSizeMm,
    rows: clampNumber(rows, def?.minRows ?? 1, def?.maxRows ?? 1),
    count: count != null ? Math.round(count) : null,
    angleDeg: angle != null ? normalDeg(angle) : RING_TOP_DEG,
  }
}

/** A new band of a style: 1.5 mm diamonds, as few rows as the style takes, around the top. */
export function newBand(settingCode: string): StudioBand {
  return bandFromRecord({}, settingCode)
}

export function settingFromParameters(itemType: StudioItemType, parameters: Record<string, unknown> | undefined): StudioSetting {
  const setting = recordOf(parameters?.setting)
  const asked =
    typeof setting?.headCode === 'string' ? setting.headCode : typeof setting?.settingCode === 'string' ? setting.settingCode : ''
  let headCode = ''
  if (asked === 'NONE') headCode = 'NONE'
  else if (LEGACY_SETTINGS[asked]) headCode = LEGACY_SETTINGS[asked].code
  else if (settingDef(asked)?.kind === 'HEAD') headCode = asked
  const bandRecord = recordOf(setting?.band)
  const bandCode = typeof bandRecord?.settingCode === 'string' ? bandRecord.settingCode : ''
  const band = itemType === 'RING' && bandRecord && settingDef(bandCode)?.kind === 'BAND' ? bandFromRecord(bandRecord, bandCode) : null
  return { headCode, band }
}

function sameSetting(a: StudioSetting, b: StudioSetting): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * The stored setting. Unchanged, the saved one is kept as it was (an older 6-prong head keeps its
 * six prongs, an older pavé its stone). `settingCode` repeats the head for the server's
 * minimum-band-width rule.
 */
export function settingPayload(
  setting: StudioSetting,
  savedParameters: Record<string, unknown> | undefined,
  itemType: StudioItemType = 'RING',
): Record<string, unknown> {
  const saved = recordOf(savedParameters?.setting)
  if (saved && sameSetting(setting, settingFromParameters(itemType, savedParameters))) return saved
  const payload: Record<string, unknown> = {}
  if (setting.headCode === 'NONE') payload.headCode = 'NONE'
  else if (setting.headCode) {
    payload.headCode = setting.headCode
    payload.settingCode = setting.headCode
  }
  if (setting.band && itemType === 'RING') {
    const band = setting.band
    const stored: Record<string, unknown> = {
      settingCode: band.settingCode,
      stoneCode: band.stoneCode,
      colorCode: band.colorCode,
      stoneSizeMm: band.stoneSizeMm,
      rows: band.rows,
    }
    if (band.count != null) stored.count = band.count
    stored.placement = { angleDeg: round1(band.angleDeg) }
    payload.band = stored
  }
  return payload
}

/**
 * Whether the first stone stands in a centre head, by the geometry's rule: a chosen head; on a
 * ring with no head chosen, a basket unless a band setting holds the stones.
 */
function hasCentreHead(itemType: StudioItemType, parameters: Record<string, unknown> | undefined): boolean {
  const stones = Array.isArray(parameters?.stones) ? parameters.stones.length : 0
  if (stones === 0) return false
  const setting = recordOf(parameters?.setting)
  const raw = typeof setting?.headCode === 'string' ? setting.headCode : typeof setting?.settingCode === 'string' ? setting.settingCode : ''
  const asked = raw.toUpperCase()
  if (asked === 'NONE') return false
  if (LEGACY_SETTINGS[asked] || settingDef(asked)?.kind === 'HEAD') return true
  if (itemType !== 'RING') return false
  const band = recordOf(setting?.band)
  const banded = band ? settingDef(band.settingCode)?.kind === 'BAND' : settingDef(asked)?.kind === 'BAND'
  return !banded
}

type Piece = { stones: number; centreHead: boolean; earringStyle?: string }

function pieceOf(itemType: StudioItemType, parameters: Record<string, unknown> | undefined): Piece {
  const style = recordOf(parameters?.size)?.earringStyleCode
  return {
    stones: Array.isArray(parameters?.stones) ? parameters.stones.length : 0,
    centreHead: hasCentreHead(itemType, parameters),
    earringStyle: typeof style === 'string' ? style : undefined,
  }
}

/** How the `index`th stone / element of the design (as the viewer shows it) can be moved. */
export function itemControls(
  itemType: StudioItemType,
  kind: 'STONE' | 'ELEMENT',
  index: number,
  parameters: Record<string, unknown> | undefined,
): PlacementControls {
  return placementControls(itemType, kind, index, pieceOf(itemType, parameters))
}

/** The angle the geometry gives an item the user has not placed. */
export function autoAngleDeg(itemType: StudioItemType, kind: 'STONE' | 'ELEMENT', index: number, piece: Piece): number {
  if (itemType === 'RING' && kind === 'STONE' && index === 0 && piece.centreHead) return RING_TOP_DEG
  if ((itemType === 'NECKLACE' || itemType === 'BRACELET') && index === 0 && (kind === 'STONE' || piece.stones === 0)) {
    return CHAIN_BOTTOM_DEG
  }
  return (index * 60) % 360
}

/** The angle the item is at now: where the user put it, else its automatic place. */
export function shownAngleDeg(
  itemType: StudioItemType,
  kind: 'STONE' | 'ELEMENT',
  index: number,
  placement: StudioPlacement,
  parameters: Record<string, unknown> | undefined,
): number {
  return placement.angleDeg ?? autoAngleDeg(itemType, kind, index, pieceOf(itemType, parameters))
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
 * A ring band narrower than the setting needs: the head's `minBandWidthMm` (settings master data,
 * else the catalogue), or the rows of band stones (the pavé table). The server refuses such a
 * design; the studio warns and blocks continuing instead.
 */
export function bandWidthConflict(
  itemType: StudioItemType,
  bandWidthMm: number,
  setting: StudioSetting | null | undefined,
  settings: SettingItem[],
  locale = 'he',
): BandWidthConflict | null {
  if (itemType !== 'RING' || !setting) return null
  const head = setting.headCode && setting.headCode !== 'NONE' ? setting.headCode : null
  if (head) {
    const row = settings.find((item) => item.code === head)
    const def = settingDef(head)
    const min = finiteNumber(row?.minBandWidthMm) ?? def?.minBandWidthMm ?? null
    if (min != null && bandWidthMm < min) {
      const label = (locale === 'en' ? row?.labelEn || def?.labelEn : row?.labelHe || def?.labelHe) || head
      const message =
        locale === 'en'
          ? `The band (${formatMm(bandWidthMm)} mm) is narrower than the ${label} setting needs (${formatMm(min)} mm). Widen the band or pick another setting.`
          : `רוחב הטבעת (${formatMm(bandWidthMm)} מ״מ) צר מהמינימום לשיבוץ ${label} (${formatMm(min)} מ״מ). הרחיבו את הטבעת או בחרו שיבוץ אחר.`
      return { settingCode: head, settingLabel: label, minBandWidthMm: min, message }
    }
  }
  const band = setting.band
  if (band) {
    const need = bandWidthForStonesMm(band.stoneSizeMm, band.rows)
    if (bandWidthMm < need - 1e-9) {
      const def = settingDef(band.settingCode)
      const label = (locale === 'en' ? def?.labelEn : def?.labelHe) ?? band.settingCode
      const rowsHe = band.rows === 1 ? 'שורה אחת' : `${band.rows} שורות`
      const message =
        locale === 'en'
          ? `The band (${formatMm(bandWidthMm)} mm) is narrower than the ${formatMm(need)} mm that ${band.rows} ${band.rows === 1 ? 'row' : 'rows'} of ${formatMm(band.stoneSizeMm)} mm stones need (pavé table). Widen the band or pick smaller stones.`
          : `רוחב הטבעת (${formatMm(bandWidthMm)} מ״מ) צר מ-${formatMm(need)} מ״מ ש-${rowsHe} של אבנים בגודל ${formatMm(band.stoneSizeMm)} מ״מ ${band.rows === 1 ? 'צריכה' : 'צריכות'} (טבלת הפאווה). הרחיבו את הטבעת או בחרו אבנים קטנות יותר.`
      return { settingCode: band.settingCode, settingLabel: label, minBandWidthMm: need, message }
    }
  }
  return null
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
  setting?: StudioSetting | null
  stones?: StudioStone[] | null
  elements?: StudioElement[] | null
}

/**
 * The parameters the 3D viewer builds: the saved design with the open tab's unsaved choices
 * applied, in the stored parameters' shape (so the viewer runs the same geometry as exports).
 */
export function viewerParameters(
  itemType: StudioItemType,
  parameters: Record<string, unknown> | undefined,
  drafts: StudioDrafts,
): Record<string, unknown> {
  const saved = parameters ?? {}
  const next: Record<string, unknown> = { ...saved }
  if (drafts.size) next.size = { ...(recordOf(saved.size) ?? {}), ...sizePayload(itemType, drafts.size) }
  if (drafts.metal) next.metal = { metalCode: drafts.metal.metalCode, purityCode: drafts.metal.purityCode }
  if (drafts.setting) next.setting = settingPayload(drafts.setting, saved, itemType)
  if (drafts.stones) next.stones = drafts.stones.map(stonePayload)
  if (drafts.elements) next.elements = drafts.elements.map(elementPayload)
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
