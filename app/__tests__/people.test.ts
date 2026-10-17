import { avatarProps, initialsOf, personName, personPhotoUri } from '../src/lib/people'
import { API_BASE_URL } from '../src/lib/api'

const SIGNED_LOGO = '/uploads/logo-1/content?exp=1&sig=ab'
const SIGNED_PHOTO = '/uploads/photo-1/content?exp=1&sig=cd'

describe('how a person is shown', () => {
  it('a jeweler by their business name, anyone else by their own name', () => {
    expect(personName({ firstName: 'Avi', lastName: 'Cohen', businessName: 'QA Goldsmith' }, '—')).toBe('QA Goldsmith')
    expect(personName({ firstName: 'דנה', lastName: 'לוי', businessName: null }, '—')).toBe('דנה לוי')
    expect(personName({ firstName: null, lastName: null, businessName: '  ' }, 'משתמש/ת')).toBe('משתמש/ת')
    expect(personName(null, 'משתמש/ת')).toBe('משתמש/ת')
  })

  it('pictured by their own photo, else their business logo, else nothing (initials are drawn)', () => {
    expect(personPhotoUri({ avatarUrl: SIGNED_PHOTO, logoUrl: SIGNED_LOGO })).toBe(`${API_BASE_URL}${SIGNED_PHOTO}`)
    expect(personPhotoUri({ avatarUrl: null, logoUrl: SIGNED_LOGO })).toBe(`${API_BASE_URL}${SIGNED_LOGO}`)
    expect(personPhotoUri({ avatarUrl: null, logoUrl: null })).toBeUndefined()
    expect(personPhotoUri(undefined)).toBeUndefined()
  })

  it('initials: the first letters of the first two words', () => {
    expect(initialsOf('QA Goldsmith')).toBe('QG')
    expect(initialsOf('דנה לוי כהן')).toBe('דל')
    expect(initialsOf('  maya ')).toBe('M')
    expect(initialsOf('')).toBe('')
    expect(initialsOf(null)).toBe('')
  })

  it('a chat avatar is the photo or logo, otherwise the initials of the shown name', () => {
    expect(avatarProps({ firstName: 'Avi', businessName: 'QA Goldsmith', logoUrl: SIGNED_LOGO }, '—')).toEqual({
      avatar: { uri: `${API_BASE_URL}${SIGNED_LOGO}` },
      avatarLabel: 'QG',
    })
    expect(avatarProps({ firstName: 'Avi', lastName: 'Cohen' }, '—')).toEqual({ avatar: undefined, avatarLabel: 'AC' })
  })
})
