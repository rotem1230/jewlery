import { ApiError } from '../src/lib/api'
import {
  completedByLabel,
  designDisplayTitle,
  designActions,
  designErrorMessage,
  isDesignReadOnly,
  listingExpiryLabel,
  NO_REGION_ID,
  regionOptions,
  regionPatchForPublish,
} from '../src/lib/designActions'

describe('what a designer can do with a design', () => {
  it('a draft can be edited, published, archived and sent to jewelers', () => {
    const actions = designActions({ status: 'DRAFT' })
    expect(actions).toMatchObject({
      readOnly: false,
      editInStudio: true,
      viewInStudio: false,
      editDetails: true,
      publish: true,
      archive: true,
      orderJewelers: true,
      moveToDrafts: false,
      duplicate: true,
      remove: true,
    })
  })

  it('a completed design is read-only: no edit or publish, the studio only views it', () => {
    const design = { status: 'COMPLETED' as const, completedBy: { id: 'j1', name: 'צורפות כהן' } }
    expect(isDesignReadOnly(design)).toBe(true)
    expect(designActions(design)).toMatchObject({
      readOnly: true,
      editInStudio: false,
      viewInStudio: true,
      editDetails: false,
      publish: false,
      orderJewelers: false,
      moveToDrafts: false,
      archive: true,
      duplicate: true,
      remove: false,
    })
  })

  it('an archived design that was completed stays read-only and cannot go back to drafts', () => {
    const design = { status: 'ARCHIVED' as const, completedBy: { id: 'j1', name: 'צורפות כהן' } }
    expect(designActions(design)).toMatchObject({ readOnly: true, moveToDrafts: false, publish: false, editDetails: false })
    expect(designActions({ status: 'ARCHIVED' })).toMatchObject({ readOnly: false, moveToDrafts: true })
  })

  it('names the business that completed it', () => {
    expect(completedByLabel({ status: 'COMPLETED', completedBy: { id: 'j1', name: 'צורפות כהן' } }, 'he')).toBe(
      'הושלם ע״י צורפות כהן',
    )
    expect(completedByLabel({ status: 'COMPLETED', completedBy: { id: 'j1', name: 'QA Goldsmith' } }, 'he')).toBe(
      'הושלם ע״י \u2068QA Goldsmith\u2069',
    )
    expect(completedByLabel({ status: 'COMPLETED', completedBy: { id: 'j1', name: null } }, 'he')).toBe('הושלם')
    expect(completedByLabel({ status: 'DRAFT', completedBy: null }, 'he')).toBeNull()
  })
})

describe('publishing with a preferred region (PRD 5.5 atelier region filter)', () => {
  it('saves the chosen region before publishing, only when it changes', () => {
    expect(regionPatchForPublish({ version: 3, preferredRegionId: null }, 'r1')).toEqual({ version: 3, preferredRegionId: 'r1' })
    expect(regionPatchForPublish({ version: 3, preferredRegionId: 'r1' }, 'r1')).toBeNull()
    expect(regionPatchForPublish({ version: 3, preferredRegionId: null }, NO_REGION_ID)).toBeNull()
    expect(regionPatchForPublish({ version: 3 }, null)).toBeNull()
  })

  it('offers "no preference" first, then the regions by name', () => {
    const options = regionOptions(
      [
        { id: 'r1', code: 'CENTER', labelHe: 'מרכז', labelEn: 'Center' },
        { id: 'r2', code: 'NORTH', labelHe: 'צפון', labelEn: null },
      ],
      'he',
    )
    expect(options).toEqual([
      { id: NO_REGION_ID, label: 'ללא העדפת אזור' },
      { id: 'r1', label: 'מרכז' },
      { id: 'r2', label: 'צפון' },
    ])
  })
})

describe('listing expiry on a published design', () => {
  const now = new Date(2026, 9, 13, 12, 0)

  it('shows until when the listing is valid, and when it lapsed', () => {
    expect(listingExpiryLabel(new Date(2026, 10, 12, 12, 0).toISOString(), 'he', now)).toBe('בתוקף עד 12.11.2026')
    expect(listingExpiryLabel(new Date(2026, 9, 1, 12, 0).toISOString(), 'he', now)).toBe('פג תוקף ב־01.10.2026')
    expect(listingExpiryLabel(null, 'he', now)).toBeNull()
  })
})

describe('why publishing or saving was refused', () => {
  const apiError = (status: number, body: unknown) => new ApiError(status, '/designs/d1/transition', JSON.stringify(body))

  it('an incomplete specification is explained with the server reason', () => {
    const message = designErrorMessage(
      apiError(400, { success: false, message: 'Invalid design parameters', errors: ["/size must have required property 'sizeCode'"] }),
      'publish',
      'he',
    )
    expect(message.title).toBe('לא ניתן לפרסם: המפרט אינו שלם')
    expect(message.body).toBe("/size must have required property 'sizeCode'")
  })

  it('a completed design explains that it can no longer change', () => {
    const message = designErrorMessage(apiError(409, { code: 'DESIGN_COMPLETED', message: 'x' }), 'save', 'he')
    expect(message.title).toBe('העיצוב הושלם')
    expect(message.body).toBe('לעיצוב זה כבר אושרה הצעת מחיר ולכן לא ניתן לשנות אותו. אפשר לשכפל אותו ולהתחיל עיצוב חדש.')
  })

  it('a stale version asks to reload', () => {
    expect(designErrorMessage(apiError(409, { code: 'STALE_VERSION' }), 'save', 'he').title).toBe('העיצוב עודכן במקום אחר')
  })
})

describe('a design without a name', () => {
  it('is called by its item type, never by a sample sentence', () => {
    expect(designDisplayTitle({ title: null, itemType: { code: 'NECKLACE', labelHe: 'שרשרת', labelEn: 'Necklace' } }, 'he')).toBe('שרשרת')
    expect(designDisplayTitle({ title: '  ', itemType: { code: 'NECKLACE', labelHe: 'שרשרת', labelEn: 'Necklace' } }, 'en')).toBe('Necklace')
    expect(designDisplayTitle({ title: 'Solitaire', itemType: null }, 'he')).toBe('Solitaire')
    expect(designDisplayTitle({ title: null, itemType: null }, 'he')).toBe('עיצוב ללא שם')
    expect(designDisplayTitle({ title: null }, 'en')).toBe('Untitled design')
  })
})

describe('deleting a design (client notes of 25.11)', () => {
  it('a draft, a published or an archived design can be deleted; a completed one cannot', () => {
    expect(designActions({ status: 'DRAFT' }).remove).toBe(true)
    expect(designActions({ status: 'PUBLISHED' }).remove).toBe(true)
    expect(designActions({ status: 'ARCHIVED' }).remove).toBe(true)
    expect(designActions({ status: 'COMPLETED', completedBy: { id: 'j1', name: 'x' } }).remove).toBe(false)
  })

  it('the server refusing because a jeweler works on it says so and offers the archive', () => {
    const err = new ApiError(409, '/designs/d1', JSON.stringify({ success: false, code: 'DESIGN_IN_WORK' }))
    const message = designErrorMessage(err, 'delete', 'he')
    expect(message.title).toBe('לא ניתן למחוק את העיצוב')
    expect(message.body).toContain('ארכיון')
    expect(designErrorMessage(new Error('x'), 'delete', 'en').title).toBe('Could not delete')
  })
})
