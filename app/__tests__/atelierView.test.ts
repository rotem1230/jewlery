import { ApiError } from '../src/lib/api'
import { bannerViews, isFeatureDisabled, isNotFound, listingExpiry } from '../src/lib/atelierView'

const NOW = new Date('2026-10-13T10:00:00.000Z')

describe('listing period (PRD: a listing is live until it expires)', () => {
  it('names the last day of a live listing', () => {
    expect(listingExpiry('2026-11-20T10:00:00.000Z', 'en', NOW)).toEqual({ date: '20/11/2026', expired: false })
  })

  it('tells an ended listing apart', () => {
    expect(listingExpiry('2026-10-01T10:00:00.000Z', 'en', NOW)?.expired).toBe(true)
  })

  it('shows nothing for a listing without an end date', () => {
    expect(listingExpiry(null, 'he', NOW)).toBeNull()
    expect(listingExpiry(undefined, 'he', NOW)).toBeNull()
    expect(listingExpiry('not a date', 'he', NOW)).toBeNull()
  })
})

describe('paid banners (PRD: sponsored content is always marked)', () => {
  it('marks every banner as sponsored, whatever the payload says', () => {
    const views = bannerViews([
      { id: 'b1', placement: 'atelier_banner', meta: { headline: '  Summer sale ', cta: 'Open' }, sponsored: true },
      { id: 'b2', placement: 'atelier_banner', meta: { headline: 'Gold week' } },
    ])
    expect(views.map((view) => view.sponsored)).toEqual([true, true])
    expect(views[0].headline).toBe('Summer sale')
    expect(views[0].cta).toBe('Open')
  })

  it('drops a banner with nothing to show', () => {
    expect(bannerViews([{ id: 'b1', placement: 'atelier_banner', meta: { headline: '   ' } }])).toEqual([])
    expect(bannerViews(null)).toEqual([])
  })

  it('opens the promoted design or jeweler', () => {
    const [design, jeweler, plain] = bannerViews([
      { id: 'b1', placement: 'atelier_banner', entityType: 'DESIGN', entityId: 'd1', meta: { headline: 'A' } },
      { id: 'b2', placement: 'atelier_banner', entityType: 'JEWELER', entityId: 'p1', meta: { headline: 'B' } },
      { id: 'b3', placement: 'atelier_banner', entityType: 'BANNER', entityId: 'x', meta: { imageUploadId: 'u1' } },
    ])
    expect(design.target).toEqual({ kind: 'design', id: 'd1' })
    expect(jeweler.target).toEqual({ kind: 'jeweler', id: 'p1' })
    expect(plain.target).toBeNull()
    expect(plain.imageUploadId).toBe('u1')
  })
})

describe('API answers the atelier screens handle quietly', () => {
  it('recognises the nearby search being switched off', () => {
    expect(isFeatureDisabled(new ApiError(403, '/atelier/geo/search', JSON.stringify({ code: 'FEATURE_DISABLED' })))).toBe(true)
    expect(isFeatureDisabled(new ApiError(403, '/atelier/geo/search', JSON.stringify({ code: 'PAYWALL' })))).toBe(false)
    expect(isFeatureDisabled(new Error('x'))).toBe(false)
  })

  it('recognises a listing that is no longer live', () => {
    expect(isNotFound(new ApiError(404, '/atelier/designs/d1', '{}'))).toBe(true)
    expect(isNotFound(new ApiError(500, '/atelier/designs/d1', '{}'))).toBe(false)
  })
})
