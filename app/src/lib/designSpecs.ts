import type { DesignDetail } from '@/src/types/api'

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
  const metal = asRecord(params.metal)
  if (metal) {
    const code = str(metal.metalCode)
    const purity = str(metal.purityCode)
    if (code) rows.push({ label: 'מתכת', value: purity ? `${code} ${purity}` : code })
  }
  const setting = asRecord(params.setting)
  const settingCode = setting ? str(setting.settingCode) : str(params.setting)
  if (settingCode) rows.push({ label: 'שיבוץ', value: settingCode })
  const finish = str(params.finishCode)
  if (finish) rows.push({ label: 'גימור', value: finish })
  const note = str(params.personalNote) ?? str(params.additionalStonesText)
  if (note) rows.push({ label: 'הערות', value: note, fullWidth: true })
  return rows
}

export function specsFromDesign(design: DesignDetail): SpecRow[] {
  const itemLabel = design.itemType?.labelHe ?? design.itemType?.code ?? null
  return specsFromParameters(design.parameters, itemLabel)
}
