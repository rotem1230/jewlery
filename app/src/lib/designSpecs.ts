import type { DesignDetail } from '@/src/types/api'
import { elementName, finishName, metalName, settingName, shapeName, stoneName } from '@/src/lib/catalogLabels'

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
  const settingCode = setting ? str(setting.settingCode) : str(params.setting)
  if (settingCode) rows.push({ label: 'שיבוץ', value: settingName(settingCode) })
  const housing = str(params.stoneHousing)
  if (housing) rows.push({ label: 'הושבת אבן', value: housing })
  const stones = Array.isArray(params.stones) ? params.stones.map(asRecord).filter(Boolean) : []
  if (stones.length > 0) {
    rows.push({ label: 'אבנים', value: stones.map((stone) => stoneText(stone as Record<string, unknown>)).join(' · '), fullWidth: true })
  }
  const elements = Array.isArray(params.elements) ? params.elements.map(asRecord).filter(Boolean) : []
  const elementNames = elements
    .map((element) => str((element as Record<string, unknown>).elementCode))
    .filter((code): code is string => Boolean(code))
    .map(elementName)
  if (elements.length > elementNames.length) elementNames.push('אלמנט אישי')
  if (elementNames.length > 0) rows.push({ label: 'אלמנטים', value: elementNames.join(', ') })
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

/** "יהלום · עגול · D · VVS1 · 5 מ״מ · 0.5 קראט". */
function stoneText(stone: Record<string, unknown>): string {
  const code = str(stone.stoneCode)
  const shape = str(stone.shape)
  const size = str(stone.sizeMm)
  const weight = str(stone.weightCt)
  return [
    code ? stoneName(code) : null,
    shape ? shapeName(shape) : null,
    str(stone.color),
    str(stone.clarity),
    size ? `${size} מ״מ` : null,
    weight ? `${weight} קראט` : null,
  ]
    .filter(Boolean)
    .join(' ')
}

export function specsFromDesign(design: DesignDetail): SpecRow[] {
  const itemLabel = design.itemType?.labelHe ?? design.itemType?.code ?? null
  const rows = specsFromParameters(design.parameters, itemLabel)
  const jewelerNotes = str(design.jewelerNotes)
  if (jewelerNotes) rows.push({ label: 'הערות לצורף', value: jewelerNotes, fullWidth: true })
  return rows
}
