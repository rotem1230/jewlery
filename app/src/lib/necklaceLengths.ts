/**
 * Necklace lengths (PRD 5.4): Choker 35–40 cm, Princess 40–45 cm, Matinee 45–50 cm, Opera 60–70
 * cm. The wizard offers one length per style, the upper end of its range (the standard chain
 * lengths 40 / 45 / 50 / 70 cm); a saved length anywhere inside a range stays valid.
 */
export type NecklaceStyle = {
  code: 'CHOKER' | 'PRINCESS' | 'MATINEE' | 'OPERA'
  labelHe: string
  labelEn: string
  minCm: number
  maxCm: number
  /** The length saved when the style is picked. */
  lengthCm: number
}

export const NECKLACE_STYLES: readonly NecklaceStyle[] = [
  { code: 'CHOKER', labelHe: 'צ׳וקר', labelEn: 'Choker', minCm: 35, maxCm: 40, lengthCm: 40 },
  { code: 'PRINCESS', labelHe: 'פרינסס', labelEn: 'Princess', minCm: 40, maxCm: 45, lengthCm: 45 },
  { code: 'MATINEE', labelHe: 'מטינה', labelEn: 'Matinee', minCm: 45, maxCm: 50, lengthCm: 50 },
  { code: 'OPERA', labelHe: 'אופרה', labelEn: 'Opera', minCm: 60, maxCm: 70, lengthCm: 70 },
]

/** The style a length belongs to; a shared bound (40, 45) belongs to the shorter style. */
export function necklaceStyleForLength(cm: number | null | undefined): NecklaceStyle | null {
  if (cm == null || !Number.isFinite(cm)) return null
  return NECKLACE_STYLES.find((style) => cm >= style.minCm && cm <= style.maxCm) ?? null
}

function range(style: NecklaceStyle): string {
  return `${style.minCm}–${style.maxCm}`
}

/** "צ׳וקר · 35–40 ס״מ" */
export function necklaceStyleLabel(style: NecklaceStyle, locale: string): string {
  return locale === 'en' ? `${style.labelEn} · ${range(style)} cm` : `${style.labelHe} · ${range(style)} ס״מ`
}

/** The measuring guide lines: "35–40 ס״מ: שרשרת צ׳וקר". */
export function necklaceGuideLines(locale: string): string[] {
  return NECKLACE_STYLES.map((style) =>
    locale === 'en' ? `${range(style)} cm: ${style.labelEn} necklace` : `${range(style)} ס״מ: שרשרת ${style.labelHe}`,
  )
}
