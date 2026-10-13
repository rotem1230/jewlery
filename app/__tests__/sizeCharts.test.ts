import { measurementGuideTable } from '../src/api/masterData'
import { necklaceGuideLines, NECKLACE_STYLES, necklaceStyleForLength } from '../src/lib/necklaceLengths'
import { formatDiameterMm, RING_SIZE_FALLBACK, ringSizeOptions } from '../src/lib/ringSizes'
import { bandWidthConflict, isNecklaceLength, NECKLACE_LENGTHS_CM } from '../src/lib/studioParams'
import type { SettingItem, SizeChartRow } from '../src/types/api'

function row(standard: string, sizeCode: string, sortOrder: number, min: string, max: string): SizeChartRow {
  return { id: `${standard}-${sizeCode}`, itemTypeId: 'ring', standard, sizeCode, diameterMinMm: min, diameterMaxMm: max, sortOrder }
}

// As the server sends it: ordered by standard, then sortOrder (IL rows first, US rows after).
const SERVER_RING_CHART: SizeChartRow[] = [
  row('IL', '52', 0, '16.55', '16.95'),
  row('IL', '54', 1, '17.19', '17.19'),
  row('IL', '64', 6, '20.4', '20.44'),
  row('US', '6.00', 0, '16.55', '16.95'),
  row('US', '7.00', 1, '17.19', '17.19'),
  row('US', '10.75', 6, '20.4', '20.44'),
]

describe('ring sizes (PRD 5.4: IL 52–64 paired with US 6.00–10.75)', () => {
  it('shows one row per size, the IL size with its US size and diameter', () => {
    const options = ringSizeOptions(SERVER_RING_CHART)
    expect(options.map((option) => option.label)).toEqual([
      '52 · US 6.00 · 16.55–16.95 מ״מ',
      '54 · US 7.00 · 17.19 מ״מ',
      '64 · US 10.75 · 20.40–20.44 מ״מ',
    ])
  })

  it('saves the IL standard and size code, as before', () => {
    const [first] = ringSizeOptions(SERVER_RING_CHART)
    expect(first).toMatchObject({ standard: 'IL', sizeCode: '52', size: '52', us: 'US 6.00', diameter: '16.55–16.95' })
  })

  it('a size with no US pair still shows on its own', () => {
    const options = ringSizeOptions([row('IL', '66', 7, '21.08', '21.08')])
    expect(options).toEqual([
      expect.objectContaining({ standard: 'IL', sizeCode: '66', us: null, label: '66 · 21.08 מ״מ' }),
    ])
  })

  it('the offline fallback is the PRD chart', () => {
    const labels = ringSizeOptions(RING_SIZE_FALLBACK).map((option) => option.label)
    expect(labels).toEqual([
      '52 · US 6.00 · 16.55–16.95 מ״מ',
      '54 · US 7.00 · 17.19 מ״מ',
      '56 · US 7.75 · 17.83 מ״מ',
      '58 · US 8.50 · 18.47 מ״מ',
      '60 · US 9.25 · 19.10 מ״מ',
      '62 · US 10.00 · 19.76 מ״מ',
      '64 · US 10.75 · 20.40–20.44 מ״מ',
    ])
  })

  it('formats diameters with two decimals and a range only when there is one', () => {
    expect(formatDiameterMm('19.1', '19.1')).toBe('19.10')
    expect(formatDiameterMm(16.55, 16.95)).toBe('16.55–16.95')
    expect(formatDiameterMm(null, '17.2')).toBe('17.20')
    expect(formatDiameterMm(null, null)).toBe('')
  })

  it('the measuring guide keeps the US size and a diameter range', () => {
    expect(
      measurementGuideTable({
        tips: [],
        table: [{ standard: 'IL', sizeCode: '52', us: '6.00', diameterMm: '16.55–16.95' }, { standard: 'IL', sizeCode: '54', diameterMm: 17.19 }],
      }),
    ).toEqual([
      { standard: 'IL', sizeCode: '52', us: '6.00', diameterMm: '16.55–16.95' },
      { standard: 'IL', sizeCode: '54', us: undefined, diameterMm: '17.19' },
    ])
  })
})

describe('necklace lengths (PRD 5.4)', () => {
  it('lists Choker 35–40, Princess 40–45, Matinee 45–50 and Opera 60–70 cm', () => {
    expect(NECKLACE_STYLES.map((style) => [style.code, style.minCm, style.maxCm])).toEqual([
      ['CHOKER', 35, 40],
      ['PRINCESS', 40, 45],
      ['MATINEE', 45, 50],
      ['OPERA', 60, 70],
    ])
    expect(necklaceGuideLines('he')).toEqual([
      '35–40 ס״מ: שרשרת צ׳וקר',
      '40–45 ס״מ: שרשרת פרינסס',
      '45–50 ס״מ: שרשרת מטינה',
      '60–70 ס״מ: שרשרת אופרה',
    ])
  })

  it('every offered length falls in its style range, and older saved lengths stay valid', () => {
    for (const style of NECKLACE_STYLES) {
      expect(necklaceStyleForLength(style.lengthCm)?.code).toBe(style.code)
    }
    expect(NECKLACE_LENGTHS_CM).toEqual(NECKLACE_STYLES.map((style) => style.lengthCm))
    expect(necklaceStyleForLength(42)?.code).toBe('PRINCESS')
    expect(isNecklaceLength(42)).toBe(true)
    expect(isNecklaceLength(55)).toBe(false)
    expect(isNecklaceLength(undefined)).toBe(false)
  })
})

describe('band width vs setting (server refuses a band narrower than the setting minimum)', () => {
  const settings: SettingItem[] = [
    { id: 's1', code: 'BEZEL', labelHe: 'משבצת סגורה', labelEn: 'Bezel', minBandWidthMm: '2' },
    { id: 's2', code: 'PAVE', labelHe: 'פאבה', labelEn: 'Pavé', minBandWidthMm: null },
  ]

  it('flags a ring band below the minimum of the chosen setting', () => {
    expect(bandWidthConflict('RING', 1.5, 'BEZEL', settings)).toEqual({
      settingCode: 'BEZEL',
      settingLabel: 'משבצת סגורה',
      minBandWidthMm: 2,
      message: 'רוחב הטבעת (1.5 מ״מ) צר מהמינימום לשיבוץ משבצת סגורה (2 מ״מ). הרחיבו את הטבעת או בחרו שיבוץ אחר.',
    })
  })

  it('accepts the minimum itself, a setting without a minimum, no setting, and non-rings', () => {
    expect(bandWidthConflict('RING', 2, 'BEZEL', settings)).toBeNull()
    expect(bandWidthConflict('RING', 0.5, 'PAVE', settings)).toBeNull()
    expect(bandWidthConflict('RING', 0.5, undefined, settings)).toBeNull()
    expect(bandWidthConflict('RING', 0.5, 'UNKNOWN', settings)).toBeNull()
    expect(bandWidthConflict('NECKLACE', 0.5, 'BEZEL', settings)).toBeNull()
  })
})
