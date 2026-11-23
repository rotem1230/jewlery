import { CUTS, SHANK_STYLES, elementDef, paletteColor, settingDef, stoneDef } from '@/src/lib/jewelryCatalog.generated'

/** A ring shank's name ("שינה מפוצלת"). */
export const shankName = (code: string) => SHANK_STYLES.find((style) => style.code === code)?.labelHe ?? code

/**
 * Hebrew names of the catalog codes stored in design parameters: the client catalogue
 * (jewelryCatalog.generated.ts), and the names of older codes. An unknown code (added later by an
 * admin) is shown as is.
 */
const METALS: Record<string, string> = {
  SILVER: 'כסף',
  YELLOW_GOLD: 'זהב צהוב',
  ROSE_GOLD: 'זהב ורוד',
  WHITE_GOLD: 'זהב לבן',
  PLATINUM: 'פלטינה',
}

/** Settings of older designs (drawn now as a basket head). */
const OLDER_SETTINGS: Record<string, string> = {
  '4_PRONG': 'משבצת 4 צבתות',
  '6_PRONG': 'משבצת 6 צבתות',
}

const FINISHES: Record<string, string> = {
  POLISHED: 'מבריק',
  MATTE: 'מט',
}

const VARIANTS: Record<string, string> = {
  OPENWORK: 'פתוח',
  SOLID: 'מלא',
  PAIR: 'זוג כנפיים',
  SINGLE: 'כנף אחת',
}

const label = (names: Record<string, string>) => (code: string) => names[code] ?? code

/** Without the English name in brackets: "אותיות (א-ת / A-Z)" → "אותיות". */
const short = (text: string) => text.replace(/\s*\([^)]*\)/g, '').trim()

export const metalName = label(METALS)
export const finishName = label(FINISHES)
export const settingName = (code: string) => OLDER_SETTINGS[code] ?? settingDef(code)?.labelHe ?? code
export const stoneName = (code: string) => stoneDef(code)?.nameHe ?? code
export const shapeName = (code: string) => CUTS.find((cut) => cut.code === code.toUpperCase())?.labelHe ?? code
export const elementName = (code: string) => (code === 'INITIAL' ? 'אות' : elementDef(code) ? short(elementDef(code)!.labelHe) : code)
export const variantName = label(VARIANTS)
/** A chart colour's name as the chart writes it ("Light Rose"). */
export const colorName = (code: string) => paletteColor(code)?.name ?? code
