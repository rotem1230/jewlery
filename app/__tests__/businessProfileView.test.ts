import { businessProfileFromRaw } from '../src/lib/businessProfileView'

describe("the jeweler's own business profile", () => {
  it('shows only what the jeweler entered: no demo name, about text, titles or stock pictures', () => {
    const profile = businessProfileFromRaw(
      {
        businessName: '',
        bio: null,
        portfolio: [{ id: 'p1', uploadId: 'u1', title: undefined }],
        reviews: [],
      } as never,
      'he',
    )
    expect(profile.name).toBe('')
    expect(profile.about).toBe('')
    expect(profile.gallery).toEqual([{ id: 'p1', title: '', image: { uri: expect.stringContaining('u1') } }])
  })

  it('keeps the entered values', () => {
    const profile = businessProfileFromRaw(
      {
        businessName: 'Golden Hands',
        bio: 'Handmade rings',
        portfolio: [{ id: 'p1', uploadId: 'u1', title: 'Solitaire', contentUrl: '/uploads/u1/content?exp=1&sig=a' }],
        reviews: [],
      } as never,
      'he',
    )
    expect(profile.name).toBe('Golden Hands')
    expect(profile.about).toBe('Handmade rings')
    expect(profile.gallery[0].title).toBe('Solitaire')
  })
})

describe('review ages', () => {
  it('reads naturally in Hebrew ("לפני דקה", not "לפני 1 דקות")', () => {
    const { formatHeTimeAgo } = jest.requireActual('../src/lib/businessProfileView')
    expect(formatHeTimeAgo(new Date(Date.now() - 61_000).toISOString(), 'he')).toBe('לפני דקה')
    expect(formatHeTimeAgo(new Date(Date.now() - 2 * 3_600_000 - 60_000).toISOString(), 'he')).toBe('לפני שעתיים')
  })
})
