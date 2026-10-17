import { ringChartDiameterMm, viewerParameters } from '../src/lib/studioParams'
import { clampPlacement, placementInPhoto } from '../src/lib/tryOnPlacement'

describe('studio preview parameters', () => {
  const saved = {
    size: { standard: 'IL', sizeCode: '56', bandWidthMm: 3 },
    metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' },
    stones: [{ stoneCode: 'DIAMOND', shape: 'OVAL', placement: { x: 1, y: 0, z: 0.14 } }],
    personalNote: 'kept',
  }

  it('without drafts the viewer shows the saved design as stored', () => {
    expect(viewerParameters('RING', saved, {})).toEqual(saved)
  })

  it("applies the open tab's unsaved choices on top of the saved design", () => {
    const next = viewerParameters('RING', saved, {
      size: { standard: 'IL', sizeCode: '58', bandWidthMm: 4.6 },
      metal: { metalCode: 'ROSE_GOLD', purityCode: '18K' },
      settingCode: '6_PRONG',
      stones: [{ stoneCode: 'SAPPHIRE', placement: { x: 0, y: 1, z: 0.14 } }],
    })
    expect(next.size).toEqual({ standard: 'IL', sizeCode: '58', bandWidthMm: 4.6 })
    expect(next.metal).toEqual({ metalCode: 'ROSE_GOLD', purityCode: '18K' })
    expect(next.setting).toEqual({ settingCode: '6_PRONG' })
    expect(next.stones).toEqual([{ stoneCode: 'SAPPHIRE', placement: { x: 0, y: 1, z: 0.14 } }])
    expect(next.personalNote).toBe('kept')
    // The saved design itself is untouched.
    expect(saved.metal.metalCode).toBe('YELLOW_GOLD')
  })

  it('reads the ring size diameter from the size chart', () => {
    const charts = [
      { standard: 'IL', sizeCode: '56', diameterMinMm: '17.83', diameterMaxMm: '17.83' },
      { standard: 'IL', sizeCode: '52', diameterMinMm: 16.55, diameterMaxMm: 16.95 },
    ]
    expect(ringChartDiameterMm(charts, { standard: 'IL', sizeCode: '56' })).toBeCloseTo(17.83)
    expect(ringChartDiameterMm(charts, { standard: 'IL', sizeCode: '52' })).toBeCloseTo(16.75)
    expect(ringChartDiameterMm(charts, { standard: 'US', sizeCode: '7' })).toBeNull()
  })
})

describe('try-on placement', () => {
  it('keeps the piece on the photo and at a size the server accepts', () => {
    expect(clampPlacement({ x: 1.4, y: -0.2, scale: 9, rotation: 190 })).toEqual({ x: 1, y: 0, scale: 1.4, rotation: -170 })
    expect(clampPlacement({ x: 0.3, y: 0.6, scale: 0.01, rotation: -200 })).toEqual({ x: 0.3, y: 0.6, scale: 0.05, rotation: 160 })
  })

  it('maps a contained photo into its frame', () => {
    // A landscape photo in a portrait frame: full width, centred vertically.
    expect(placementInPhoto({ width: 300, height: 600 }, { width: 400, height: 300 })).toEqual({
      x: 0,
      y: 187.5,
      width: 300,
      height: 225,
    })
    expect(placementInPhoto({ width: 300, height: 600 }, null).width).toBe(0)
  })
})
