import { specsFromParameters } from '../src/lib/designSpecs'

/** What the jeweler reads: every choice of the client catalogue, in Hebrew, with where it goes. */
describe('design specification with the client catalogue', () => {
  const rows = (parameters: Record<string, unknown>) =>
    Object.fromEntries(specsFromParameters(parameters, 'טבעת').map((row) => [row.label, row.value]))

  it('a stone: its name, cut, chart colour, size, carat and place', () => {
    const value = rows({
      stones: [
        { stoneCode: 'SAPPHIRE', cutCode: 'OVAL', colorCode: 'LIGHT_ROSE', sizeMm: 6, placement: { angleDeg: 90, offsetMm: 0.5, rotationDeg: 30 } },
        { stoneCode: 'OPAL', cutCode: 'CABOCHON', colorCode: 'WHITE_OPAL', sizeMm: 3, placement: { offsetMm: 0, rotationDeg: 0 } },
      ],
    })['אבנים']
    expect(value).toContain('ספיר אובלי Light Rose 6 מ״מ ≈')
    expect(value).toContain('מיקום 90° · 0.5 מ״מ לרוחב · סיבוב 30°')
    expect(value).toContain('אופל קבושון עגול White Opal 3 מ״מ')
  })

  it('the head and the band setting', () => {
    const value = rows({
      setting: {
        headCode: 'HALF_BEZEL',
        settingCode: 'HALF_BEZEL',
        band: { settingCode: 'PAVE', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 1.5, rows: 2, count: 9, placement: { angleDeg: 270 } },
      },
    })
    expect(value['שיבוץ']).toBe('חצי משבצת (Half-Bezel)')
    expect(value['שיבוץ בטבעת']).toBe('פאווה – 2 שורות ומעלה (Pavé) · יהלום Crystal 1.5 מ״מ · 2 שורות · 9 אבנים בשורה · מיקום 270°')
    expect(rows({ setting: { headCode: 'NONE' } })['שיבוץ']).toBe('ללא בית לאבן')
  })

  it('elements with their text, style, size and place', () => {
    const value = rows({
      elements: [
        { elementCode: 'LETTERS', text: 'דנה', sizeMm: 5, placement: { angleDeg: 200 } },
        { elementCode: 'STAR_OF_DAVID', variant: 'SOLID' },
        { customUploadId: 'u1' },
      ],
    })['אלמנטים']
    expect(value).toBe('אותיות "דנה" 5 מ״מ, מיקום 200° · מגן דוד (מלא) · אלמנט אישי')
  })
})
