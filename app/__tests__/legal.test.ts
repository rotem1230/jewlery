import { Alert } from 'react-native'
import { t } from '../src/i18n'
import { confirmJewelerEngagement, legalBlocks } from '../src/lib/legal'

describe('the terms as the CMS publishes them', () => {
  it('keeps each block with its kind, and the anchors of the parts', () => {
    const body = {
      blocks: [
        { type: 'heading', text: 'תקנון' },
        { type: 'section', text: "חלק ב'", id: 'privacy' },
        { type: 'subheading', text: '1. מידע' },
        { type: 'item', text: '1.1. פרטים' },
        { type: 'paragraph', text: 'פסקה' },
      ],
    }
    expect(legalBlocks(body)).toEqual([
      { type: 'heading', text: 'תקנון' },
      { type: 'section', text: "חלק ב'", id: 'privacy' },
      { type: 'subheading', text: '1. מידע' },
      { type: 'item', text: '1.1. פרטים' },
      { type: 'paragraph', text: 'פסקה' },
    ])
  })

  it('an unknown kind is a paragraph, an empty block is skipped, plain text is one paragraph, nothing is null', () => {
    expect(legalBlocks({ blocks: [{ type: 'quote', text: 'x' }, { type: 'item' }, { q: 'שאלה', a: 'תשובה' }] })).toEqual([
      { type: 'paragraph', text: 'x' },
      { type: 'paragraph', text: 'שאלה\nתשובה' },
    ])
    expect(legalBlocks('טקסט')).toEqual([{ type: 'paragraph', text: 'טקסט' }])
    expect(legalBlocks({ text: 'טקסט' })).toEqual([{ type: 'paragraph', text: 'טקסט' }])
    expect(legalBlocks(null)).toBeNull()
    expect(legalBlocks({ blocks: [] })).toBeNull()
  })
})

describe('before working with a jeweler (section 5.4 of the terms)', () => {
  const answer = (pick: 'continue' | 'cancel' | 'dismiss') =>
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons, options) => {
      if (pick === 'dismiss') options?.onDismiss?.()
      else buttons?.find((button) => (pick === 'continue' ? button.style !== 'cancel' : button.style === 'cancel'))?.onPress?.()
    })

  afterEach(() => jest.restoreAllMocks())

  it('shows the disclaimer of the terms and goes on only when the user continues', async () => {
    const alert = answer('continue')
    await expect(confirmJewelerEngagement(t)).resolves.toBe(true)
    expect(alert.mock.calls[0][1]).toBe('בכפתור זה אתה מועבר להתקשרות עצמאית מול צורף חיצוני. האפליקציה אינה אחראית לתוצר הסופי, בהתאם לסעיף 5.4 בתקנון.')
  })

  it('cancelling or closing the dialog stops', async () => {
    answer('cancel')
    await expect(confirmJewelerEngagement(t)).resolves.toBe(false)
    jest.restoreAllMocks()
    answer('dismiss')
    await expect(confirmJewelerEngagement(t)).resolves.toBe(false)
  })
})
