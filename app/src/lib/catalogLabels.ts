/**
 * Hebrew names of the catalog codes stored in design parameters, as seeded on the server
 * (backend/prisma/seed.ts). An unknown code (added later by an admin) is shown as is.
 */
const METALS: Record<string, string> = {
  SILVER: 'כסף',
  YELLOW_GOLD: 'זהב צהוב',
  ROSE_GOLD: 'זהב ורוד',
  WHITE_GOLD: 'זהב לבן',
  PLATINUM: 'פלטינה',
}

const SETTINGS: Record<string, string> = {
  '4_PRONG': 'משבצת 4 צבתות',
  '6_PRONG': 'משבצת 6 צבתות',
  BEZEL: 'משבצת סגורה',
  PAVE: 'פאבה',
}

const STONES: Record<string, string> = {
  DIAMOND: 'יהלום',
  SAPPHIRE: 'ספיר',
  RUBY: 'רובי',
  EMERALD: 'ברקת',
}

const SHAPES: Record<string, string> = {
  ROUND: 'עגול',
  OVAL: 'אובלי',
  EMERALD: 'אמרלד',
}

const ELEMENTS: Record<string, string> = {
  HEART: 'לב',
  STAR: 'כוכב',
  LEAF: 'עלה',
  INITIAL: 'אות',
}

const FINISHES: Record<string, string> = {
  POLISHED: 'מבריק',
  MATTE: 'מט',
}

const label = (names: Record<string, string>) => (code: string) => names[code] ?? code

export const metalName = label(METALS)
export const settingName = label(SETTINGS)
export const stoneName = label(STONES)
export const shapeName = label(SHAPES)
export const elementName = label(ELEMENTS)
export const finishName = label(FINISHES)
