import {
  addElement,
  addStone,
  autoAngleDeg,
  bandWidthConflict,
  caratLabel,
  draftsChanged,
  elementsFromParameters,
  itemControls,
  metalFromParameters,
  newBand,
  placementPayload,
  settingFromParameters,
  settingSetsBand,
  settingPayload,
  shownAngleDeg,
  sizeFromParameters,
  stoneSizeRange,
  stonesFromParameters,
  viewerParameters,
  withDraggedPlacement,
  type StudioSetting,
} from '../src/lib/studioParams'
import { JEWELRY_GEOMETRY_JS } from '../src/lib/jewelryGeometry.generated'

type Geometry = {
  specFromParameters: (type: string, parameters: unknown) => { setting: string | null; stones: Array<{ placed: boolean; angle: number }> }
}
function geometry(): Geometry {
  const window: { JewelryGeometry?: Geometry } = {}
  // Our own generated file (the viewer runs the same text).
  // eslint-disable-next-line no-new-func
  new Function('window', JEWELRY_GEOMETRY_JS)(window)
  return window.JewelryGeometry!
}

const settings = [
  { id: 's1', code: 'BRIGHT_CUT', labelHe: 'ברייט-קאט (Bright-Cut)', labelEn: 'Bright-Cut', minBandWidthMm: '2.5' },
  { id: 's2', code: 'BASKET', labelHe: 'סל (Basket)', labelEn: 'Basket', minBandWidthMm: 1.5 },
]

describe('studio stones (the client catalogue)', () => {
  it('reads a saved stone with its cut, chart colour, size and placement', () => {
    const [stone] = stonesFromParameters({
      stones: [{ stoneCode: 'SAPPHIRE', cutCode: 'OVAL', colorCode: 'LIGHT_ROSE', sizeMm: 6, placement: { angleDeg: 120, offsetMm: 0.5, rotationDeg: 30 } }],
    })
    expect(stone).toEqual({
      stoneCode: 'SAPPHIRE',
      cutCode: 'OVAL',
      colorCode: 'LIGHT_ROSE',
      sizeMm: 6,
      placement: { angleDeg: 120, offsetMm: 0.5, rotationDeg: 30 },
    })
  })

  it('an older stone: its shape is the cut, its own colour, the automatic place', () => {
    const [stone, opal] = stonesFromParameters({
      stones: [
        { stoneCode: 'DIAMOND', shape: 'OVAL', placement: { x: 1, y: 0, z: 0.14 } },
        { stoneCode: 'OPAL', shape: 'ROUND' },
      ],
    })
    expect(stone).toEqual({ stoneCode: 'DIAMOND', cutCode: 'OVAL', colorCode: 'CRYSTAL', sizeMm: null, placement: { angleDeg: null, offsetMm: 0, rotationDeg: 0 } })
    // Opal comes only as a cabochon.
    expect(opal.cutCode).toBe('CABOCHON')
    expect(opal.colorCode).toBe('WHITE_OPAL')
  })

  it('a new stone starts in its own colour and first cut, at a size for its place', () => {
    const ring = addStone('RING', [], 'RUBY')
    expect(ring).toEqual([{ stoneCode: 'RUBY', cutCode: 'ROUND', colorCode: 'RUBY', sizeMm: 5, placement: { angleDeg: null, offsetMm: 0, rotationDeg: 0 } }])
    const two = addStone('RING', ring, 'TURQUOISE')
    expect(two[1]).toMatchObject({ cutCode: 'CABOCHON', sizeMm: 2.5 })
    expect(addStone('NECKLACE', [], 'CITRINE')[0].sizeMm).toBe(6)
  })

  it('sizes from 2 mm to 1.5 ct, with the carat estimate', () => {
    expect(stoneSizeRange('DIAMOND', 'ROUND')).toEqual({ min: 2, max: 7.3 })
    expect(caratLabel('DIAMOND', 'ROUND', 6.5, 'he')).toBe('≈ 1.02 קראט')
    expect(caratLabel('DIAMOND', 'ROUND', 6.5, 'en')).toBe('≈ 1.02 ct')
  })

  it('saves the placement the user chose; an automatic place stays automatic', () => {
    expect(placementPayload({ angleDeg: 45.04, offsetMm: -1.26, rotationDeg: 10 })).toEqual({ angleDeg: 45, offsetMm: -1.3, rotationDeg: 10 })
    expect(placementPayload({ angleDeg: null, offsetMm: 0, rotationDeg: 0 })).toEqual({ offsetMm: 0, rotationDeg: 0 })
  })

  it('the automatic place is where the geometry puts the item', () => {
    const geo = geometry()
    const ring = geo.specFromParameters('RING', { stones: [{ stoneCode: 'RUBY' }, { stoneCode: 'RUBY' }] })
    expect(autoAngleDeg('RING', 'STONE', 1, { stones: 2, centreHead: ring.setting != null })).toBeCloseTo((ring.stones[1].angle * 180) / Math.PI, 5)
    expect(autoAngleDeg('RING', 'STONE', 0, { stones: 2, centreHead: true })).toBe(90)
    expect(autoAngleDeg('NECKLACE', 'STONE', 0, { stones: 1, centreHead: false })).toBe(270)
    expect(autoAngleDeg('NECKLACE', 'ELEMENT', 0, { stones: 0, centreHead: false })).toBe(270)
    expect(autoAngleDeg('NECKLACE', 'ELEMENT', 0, { stones: 1, centreHead: false })).toBe(0)
  })

  it('a drag on the model places the item it was for, and only that one', () => {
    const stones = addStone('RING', addStone('RING', [], 'RUBY'), 'SAPPHIRE')
    const next = withDraggedPlacement(stones, 1, { angleDeg: 200, offsetMm: 0.8 })
    expect(next[1].placement).toEqual({ angleDeg: 200, offsetMm: 0.8, rotationDeg: 0 })
    expect(next[0]).toBe(stones[0])
    expect(withDraggedPlacement(stones, 5, { angleDeg: 1, offsetMm: 0 })).toBe(stones)
    // Dragged far out on an earring: as far as the server accepts; a negative angle goes round.
    expect(withDraggedPlacement(stones, 0, { angleDeg: -90, offsetMm: 40 })[0].placement).toEqual({ angleDeg: 270, offsetMm: 15, rotationDeg: 0 })
  })

  it('a stud element behind the stone: saved only when chosen, read back, and cleared by the next drag (notes of 24.11)', () => {
    const behind = { angleDeg: 30, offsetMm: 0, rotationDeg: -95, behindHead: true as const }
    expect(placementPayload(behind)).toEqual({ angleDeg: 30, offsetMm: 0, rotationDeg: -95, behindHead: true })
    expect(placementPayload({ angleDeg: 30, offsetMm: 0, rotationDeg: 0 })).not.toHaveProperty('behindHead')
    const elements = elementsFromParameters({ elements: [{ elementCode: 'FLOWER', placement: placementPayload(behind) }] })
    expect(elements[0].placement).toEqual(behind)
    // Let go over the head: behind it; then dragged out: beside it again, its turn kept.
    const dropped = withDraggedPlacement(elements, 0, { angleDeg: 10, offsetMm: 0, behindHead: true })
    expect(dropped[0].placement).toEqual({ angleDeg: 10, offsetMm: 0, rotationDeg: -95, behindHead: true })
    expect(withDraggedPlacement(dropped, 0, { angleDeg: 10, offsetMm: 6 })[0].placement).toEqual({ angleDeg: 10, offsetMm: 6, rotationDeg: -95 })
  })
})

describe('studio elements (the element sheet)', () => {
  it('reads a text element: only the letters it may carry, in capitals', () => {
    const [name, star] = elementsFromParameters({
      elements: [
        { elementCode: 'LETTERS', text: 'dana!7', sizeMm: 5, placement: { angleDeg: 200 } },
        { elementCode: 'STAR_OF_DAVID', variant: 'SOLID' },
      ],
    })
    expect(name).toEqual({ elementCode: 'LETTERS', text: 'DANA', sizeMm: 5, placement: { angleDeg: 200, offsetMm: 0, rotationDeg: 0 } })
    expect(star).toMatchObject({ elementCode: 'STAR_OF_DAVID', variant: 'SOLID', sizeMm: null })
  })

  it('a new element starts in its first style, inside its size range; a picture keeps its upload', () => {
    const list = addElement('RING', [], { elementCode: 'ANGEL_WINGS' }, 3)
    expect(list[0]).toMatchObject({ elementCode: 'ANGEL_WINGS', variant: 'PAIR', sizeMm: 5.5 })
    expect(addElement('RING', [], { elementCode: 'TREE_OF_LIFE' }, 3)[0].sizeMm).toBe(8)
    expect(addElement('RING', [], { elementCode: 'LETTERS' }, 3)[0]).toMatchObject({ text: '' })
    expect(addElement('RING', [], { customUploadId: 'u1' }, 3)[0]).toEqual({ customUploadId: 'u1', sizeMm: null, placement: { angleDeg: null, offsetMm: 0, rotationDeg: 0 } })
  })
})

describe('studio setting: the head and the band', () => {
  it('reads the head and the band; older prong settings are a basket head', () => {
    expect(settingFromParameters('RING', { setting: { headCode: 'HALF_BEZEL', band: { settingCode: 'PAVE', stoneCode: 'RUBY', stoneSizeMm: 2, rows: 3, count: 12, placement: { angleDeg: 270 } } } })).toEqual({
      headCode: 'HALF_BEZEL',
      band: { settingCode: 'PAVE', stoneCode: 'RUBY', colorCode: 'RUBY', stoneSizeMm: 2, rows: 3, count: 12, angleDeg: 270 },
    })
    expect(settingFromParameters('RING', { setting: { settingCode: '6_PRONG' } })).toEqual({ headCode: 'BASKET', band: null })
    expect(settingFromParameters('RING', { setting: { headCode: 'NONE' } })).toEqual({ headCode: 'NONE', band: null })
    expect(settingFromParameters('RING', {})).toEqual({ headCode: '', band: null })
  })

  it('whether the ring sets stones in its band: a band, or an older pavé setting kept as saved', () => {
    const older = { setting: { settingCode: 'PAVE' } }
    expect(settingSetsBand(settingFromParameters('RING', older), older, 'RING')).toBe(true)
    // A head chosen instead: the older pavé is not saved any more.
    expect(settingSetsBand({ headCode: 'BASKET', band: null }, older, 'RING')).toBe(false)
    expect(settingSetsBand({ headCode: '', band: newBand('PAVE') }, {}, 'RING')).toBe(true)
    expect(settingSetsBand({ headCode: 'BASKET', band: null }, {}, 'RING')).toBe(false)
    expect(settingSetsBand({ headCode: '', band: newBand('PAVE') }, {}, 'NECKLACE')).toBe(false)
  })

  it('an unchanged older setting is saved as it was (a 6-prong head keeps its six prongs)', () => {
    const saved = { setting: { settingCode: '6_PRONG' } }
    expect(settingPayload(settingFromParameters('RING', saved), saved)).toEqual({ settingCode: '6_PRONG' })
    const changed: StudioSetting = { headCode: 'BEZEL', band: null }
    expect(settingPayload(changed, saved)).toEqual({ headCode: 'BEZEL', settingCode: 'BEZEL' })
    expect(settingPayload({ headCode: 'NONE', band: null }, saved)).toEqual({ headCode: 'NONE' })
  })

  it('a band is saved with its stone, size, rows and place', () => {
    const setting: StudioSetting = {
      headCode: 'BASKET',
      band: { settingCode: 'BAND_CHANNEL', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 1.5, rows: 1, count: null, angleDeg: 90 },
    }
    expect(settingPayload(setting, {})).toEqual({
      headCode: 'BASKET',
      settingCode: 'BASKET',
      band: { settingCode: 'BAND_CHANNEL', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 1.5, rows: 1, placement: { angleDeg: 90 } },
    })
  })

  it('the band is too narrow for the head, or for the rows of band stones (the pavé table)', () => {
    const head = bandWidthConflict('RING', 2, { headCode: 'BRIGHT_CUT', band: null }, settings, 'he')
    expect(head?.minBandWidthMm).toBe(2.5)
    expect(bandWidthConflict('RING', 2.5, { headCode: 'BRIGHT_CUT', band: null }, settings, 'he')).toBeNull()
    const band = { settingCode: 'PAVE', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 2, rows: 2, count: null, angleDeg: 90 }
    const rows = bandWidthConflict('RING', 3, { headCode: '', band }, settings, 'he')
    expect(rows?.minBandWidthMm).toBe(4.95)
    expect(rows?.message).toBe('רוחב הטבעת (3 מ״מ) צר מ-4.95 מ״מ ש-2 שורות של אבנים בגודל 2 מ״מ צריכות (טבלת הפאווה). הרחיבו את הטבעת או בחרו אבנים קטנות יותר.')
    expect(bandWidthConflict('RING', 3, { headCode: '', band }, settings, 'en')?.message).toBe(
      'The band (3 mm) is narrower than the 4.95 mm that 2 rows of 2 mm stones need (pavé table). Widen the band or pick smaller stones.',
    )
    expect(bandWidthConflict('NECKLACE', 1, { headCode: 'BRIGHT_CUT', band: null }, settings, 'he')).toBeNull()
  })

  it('a stone added beside a band setting, with no head chosen, stands in the basket on top', () => {
    const band = { settingCode: 'BAND_BEAD_BRIGHT_CUT', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 1.5, rows: 1, count: null, angleDeg: 90 }
    const params = viewerParameters('RING', { size: { standard: 'IL', sizeCode: '56', bandWidthMm: 6 } }, {
      setting: { headCode: '', band },
      stones: addStone('RING', [], 'SAPPHIRE'),
    })
    // The studio: the centre stone moves along the ring only, and starts on top.
    expect(itemControls('RING', 'STONE', 0, params).across).toBeNull()
    expect(shownAngleDeg('RING', 'STONE', 0, { angleDeg: null, offsetMm: 0, rotationDeg: 0 }, params)).toBe(90)
    // The viewer runs the server's geometry: the same basket.
    expect(geometry().specFromParameters('RING', params).setting).toBe('BASKET')
  })

  it('the head the studio expects is the one the geometry builds', () => {
    const geo = geometry()
    const cases: Array<Record<string, unknown>> = [
      { stones: [{ stoneCode: 'RUBY' }] },
      { stones: [{ stoneCode: 'RUBY' }], setting: { headCode: 'NONE' } },
      { stones: [{ stoneCode: 'RUBY' }], setting: { band: { settingCode: 'PAVE' } } },
      { stones: [{ stoneCode: 'RUBY' }], setting: { headCode: 'NONE', band: { settingCode: 'PAVE' } } },
      // An older pavé design: the setting itself was the band.
      { stones: [{ stoneCode: 'RUBY' }, { stoneCode: 'SAPPHIRE' }], setting: { settingCode: 'PAVE' } },
      // Entries that are not stones are not a centre stone.
      { stones: [{}], setting: { band: { settingCode: 'PAVE' } } },
      { stones: [null, { stoneCode: '' }], setting: { band: { settingCode: 'PAVE' } } },
      { stones: [{ stoneCode: 'RUBY' }], setting: { headCode: 'BEZEL', band: { settingCode: 'PAVE' } } },
      { stones: [], setting: { headCode: 'BEZEL' } },
    ]
    for (const params of cases) {
      const controls = itemControls('RING', 'STONE', 0, params)
      const built = geo.specFromParameters('RING', params)
      expect({ params, centre: controls.across === null }).toEqual({ params, centre: built.setting != null && (params.stones as unknown[]).length > 0 })
    }
  })
})

describe('changes not saved yet', () => {
  const saved = {
    size: { standard: 'IL', sizeCode: '56', bandWidthMm: 6 },
    metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' },
    // An older stone (a shape, no colour) and a 6-prong head: read back the same, they are no change.
    stones: [{ stoneCode: 'DIAMOND', shape: 'OVAL' }],
    setting: { settingCode: '6_PRONG' },
    elements: [{ elementCode: 'STAR' }],
  }

  it('a tab only opened is no change', () => {
    expect(
      draftsChanged('RING', saved, {
        size: sizeFromParameters(saved),
        metal: metalFromParameters(saved),
        setting: settingFromParameters('RING', saved),
        stones: stonesFromParameters(saved),
        elements: elementsFromParameters(saved),
      }),
    ).toBe(false)
    expect(draftsChanged('RING', saved, {})).toBe(false)
  })

  it('a band picked, a stone added, a size or metal changed is a change', () => {
    expect(draftsChanged('RING', saved, { setting: { headCode: 'BASKET', band: newBand('PAVE') } })).toBe(true)
    expect(draftsChanged('RING', saved, { stones: addStone('RING', stonesFromParameters(saved), 'RUBY') })).toBe(true)
    expect(draftsChanged('RING', saved, { size: { ...sizeFromParameters(saved), bandWidthMm: 4 } })).toBe(true)
    expect(draftsChanged('RING', saved, { metal: { metalCode: 'ROSE_GOLD', purityCode: '14K' } })).toBe(true)
    expect(draftsChanged('RING', saved, { elements: [] })).toBe(true)
  })
})

describe('the viewer builds the open tab', () => {
  it('writes the drafts in the stored shape', () => {
    const next = viewerParameters('RING', { size: { bandWidthMm: 3 } }, {
      setting: { headCode: 'BEZEL', band: null },
      stones: [{ stoneCode: 'RUBY', cutCode: 'OVAL', colorCode: 'SIAM', sizeMm: 4, placement: { angleDeg: 80, offsetMm: 0, rotationDeg: 15 } }],
      elements: [{ elementCode: 'LETTERS', text: 'AB', sizeMm: 4, placement: { angleDeg: null, offsetMm: 0, rotationDeg: 0 } }],
    })
    expect(next.setting).toEqual({ headCode: 'BEZEL', settingCode: 'BEZEL' })
    expect(next.stones).toEqual([{ stoneCode: 'RUBY', cutCode: 'OVAL', colorCode: 'SIAM', sizeMm: 4, placement: { angleDeg: 80, offsetMm: 0, rotationDeg: 15 } }])
    expect(next.elements).toEqual([{ elementCode: 'LETTERS', text: 'AB', sizeMm: 4, placement: { offsetMm: 0, rotationDeg: 0 } }])
  })
})
