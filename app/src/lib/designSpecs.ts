import type { DesignDetail } from '@/src/types/api'
import { colorName, elementName, finishName, metalName, settingName, shapeName, stoneName, variantName } from '@/src/lib/catalogLabels'
import { caratEstimate, settingDef, type CutCode } from '@/src/lib/jewelryCatalog.generated'

export type SpecRow = { label: string; value: string; fullWidth?: boolean }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/** Flatten known design.parameters keys into spec-grid rows. */
export function specsFromParameters(
  parameters: Record<string, unknown> | null | undefined,
  itemLabel?: string | null,
): SpecRow[] {
  const rows: SpecRow[] = []
  if (itemLabel) rows.push({ label: 'סוג', value: itemLabel })
  const params = parameters ?? {}
  const size = asRecord(params.size)
  if (size) {
    const code = str(size.sizeCode)
    const standard = str(size.standard)
    if (code) rows.push({ label: 'מידה', value: standard ? `${code} (${standard})` : code })
    const width = str(size.bandWidthMm)
    if (width) rows.push({ label: 'רוחב הטבעת', value: `${width} מ״מ` })
    const necklace = str(size.necklaceLengthCm)
    if (necklace) rows.push({ label: 'אורך', value: `${necklace} ס״מ` })
    const wrist = str(size.wristCircumferenceCm)
    if (wrist) rows.push({ label: 'היקף שורש כף היד', value: `${wrist} ס״מ` })
    const style = str(size.earringStyleCode)
    if (style) rows.push({ label: 'סגנון', value: style })
  }
  const metal = metalLabel(params)
  if (metal) rows.push({ label: 'מתכת', value: metal })
  const setting = asRecord(params.setting)
  // The head (`headCode`, or the older `settingCode`), then the stones set in the band.
  const headCode = setting ? str(setting.headCode) ?? str(setting.settingCode) : str(params.setting)
  if (headCode) rows.push({ label: 'שיבוץ', value: headCode === 'NONE' ? 'ללא בית לאבן' : settingName(headCode) })
  const band = asRecord(setting?.band)
  if (band) rows.push({ label: 'שיבוץ בטבעת', value: bandText(band), fullWidth: true })
  const housing = str(params.stoneHousing)
  if (housing) rows.push({ label: 'הושבת אבן', value: housing })
  const stones = Array.isArray(params.stones) ? params.stones.map(asRecord).filter(Boolean) : []
  if (stones.length > 0) {
    rows.push({ label: 'אבנים', value: stones.map((stone) => stoneText(stone as Record<string, unknown>)).join(' · '), fullWidth: true })
  }
  const elements = Array.isArray(params.elements) ? params.elements.map(asRecord).filter(Boolean) : []
  if (elements.length > 0) {
    const named = elements.filter((element) => str((element as Record<string, unknown>).elementCode))
    const texts = named.map((element) => elementTextOf(element as Record<string, unknown>))
    if (elements.length > named.length) texts.push('אלמנט אישי')
    // Short lists read as before ("לב, כוכב"); a list with details is split by dots.
    const plain = texts.every((text) => !/[ "]/.test(text))
    rows.push({ label: 'אלמנטים', value: texts.join(plain ? ', ' : ' · '), fullWidth: !plain })
  }
  const finish = str(params.finishCode)
  if (finish) rows.push({ label: 'גימור', value: finishName(finish) })
  const additional = str(params.additionalStonesText)
  if (additional) rows.push({ label: 'אבנים נוספות', value: additional, fullWidth: true })
  const note = str(params.personalNote)
  if (note) rows.push({ label: 'הערות', value: note, fullWidth: true })
  return rows
}

/** "זהב צהוב 14K": the metal of a design, named. */
export function metalLabel(parameters: Record<string, unknown> | null | undefined): string | null {
  const metal = asRecord(parameters?.metal)
  const code = metal ? str(metal.metalCode) : null
  if (!code) return null
  const purity = str(metal?.purityCode)
  return purity ? `${metalName(code)} ${purity}` : metalName(code)
}

/** "מיקום 90° · 0.5 מ״מ לרוחב · סיבוב 30°": where the user put an item (nothing when automatic). */
function placementText(value: unknown): string | null {
  const placement = asRecord(value)
  const angle = typeof placement?.angleDeg === 'number' ? placement.angleDeg : null
  if (angle == null) return null
  const offset = typeof placement?.offsetMm === 'number' ? placement.offsetMm : 0
  const turn = typeof placement?.rotationDeg === 'number' ? placement.rotationDeg : 0
  return [
    `מיקום ${Math.round(angle)}°`,
    offset ? `${offset} מ״מ לרוחב` : null,
    turn ? `סיבוב ${Math.round(turn)}°` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "ספיר אובלי Light Rose 6 מ״מ ≈ 1.2 קראט, מיקום 90°" (older stones: shape, colour grade, clarity). */
function stoneText(stone: Record<string, unknown>): string {
  const code = str(stone.stoneCode)
  const cut = str(stone.cutCode) ?? str(stone.shape)
  const color = str(stone.colorCode)
  const size = typeof stone.sizeMm === 'number' ? stone.sizeMm : null
  const weight = str(stone.weightCt)
  const carat =
    !weight && code && size && str(stone.cutCode) ? `≈ ${caratEstimate(code, str(stone.cutCode) as CutCode, size).toFixed(2)} קראט` : null
  const text = [
    code ? stoneName(code) : null,
    cut ? shapeName(cut) : null,
    color ? colorName(color) : str(stone.color),
    str(stone.clarity),
    size ? `${size} מ״מ` : str(stone.sizeMm) ? `${str(stone.sizeMm)} מ״מ` : null,
    carat,
    weight ? `${weight} קראט` : null,
  ]
    .filter(Boolean)
    .join(' ')
  const place = placementText(stone.placement)
  return place ? `${text}, ${place}` : text
}

/** "פאווה – 2 שורות ומעלה (Pavé) · יהלום Crystal 1.5 מ״מ · 2 שורות · 9 אבנים בשורה · מיקום 270°". */
function bandText(band: Record<string, unknown>): string {
  const code = str(band.settingCode)
  const stone = [str(band.stoneCode) ? stoneName(str(band.stoneCode)!) : null, str(band.colorCode) ? colorName(str(band.colorCode)!) : null, str(band.stoneSizeMm) ? `${str(band.stoneSizeMm)} מ״מ` : null]
    .filter(Boolean)
    .join(' ')
  const rows = typeof band.rows === 'number' && (band.rows > 1 || (settingDef(code)?.maxRows ?? 1) > 1) ? `${band.rows} שורות` : null
  const count = typeof band.count === 'number' ? `${band.count} אבנים בשורה` : null
  const angle = typeof asRecord(band.placement)?.angleDeg === 'number' ? `מיקום ${Math.round(asRecord(band.placement)!.angleDeg as number)}°` : null
  return [code ? settingName(code) : null, stone || null, rows, count, angle].filter(Boolean).join(' · ')
}

/** "אותיות "דנה" 5 מ״מ, מיקום 200°", "מגן דוד (מלא)", "לב". */
function elementTextOf(element: Record<string, unknown>): string {
  const code = str(element.elementCode) ?? ''
  const text = str(element.text)
  const variant = str(element.variant)
  const size = str(element.sizeMm)
  const name = [elementName(code), text ? `"${text}"` : null, variant ? `(${variantName(variant)})` : null, size ? `${size} מ״מ` : null]
    .filter(Boolean)
    .join(' ')
  const place = placementText(element.placement)
  return place ? `${name}, ${place}` : name
}

export function specsFromDesign(design: DesignDetail): SpecRow[] {
  const itemLabel = design.itemType?.labelHe ?? design.itemType?.code ?? null
  const rows = specsFromParameters(design.parameters, itemLabel)
  const jewelerNotes = str(design.jewelerNotes)
  if (jewelerNotes) rows.push({ label: 'הערות לצורף', value: jewelerNotes, fullWidth: true })
  return rows
}
