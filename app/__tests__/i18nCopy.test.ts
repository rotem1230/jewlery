import { setLocale, t } from '../src/i18n'

// The app has no Node typings; only reading the strings file is needed.
type Fs = { readFileSync: (path: string, encoding: 'utf8') => string }
type PathModule = { join: (...parts: string[]) => string }
declare const __dirname: string
const { readFileSync } = require('fs') as Fs
const { join } = require('path') as PathModule

afterEach(() => setLocale('he'))

/**
 * QA: the studio told users "מודל לדוגמה — נחליף ב-Tripo בהמשך. הלשוניות האחרות לא קוראות ל-AI."
 * Copy shown to users never carries notes from the developers (vendor names, build steps).
 */
describe('copy shown to users', () => {
  it('the inspiration hint says the AI makes an inspiration picture, from what, and where it goes', () => {
    expect(t('studioInspirationSampleHint')).toBe(
      'הבינה המלאכותית יוצרת תמונת השראה לפי ההערה שכתבת, ואם יש תמונת השראה, גם לפיה. התמונה החדשה הופכת לתמונת ההשראה ותישלח לצורף. היצירה לוקחת כמה שניות.',
    )
    setLocale('en')
    expect(t('studioInspirationSampleHint')).toBe(
      'AI creates an inspiration picture from your note, and from your inspiration picture when there is one. The new picture becomes your inspiration picture and goes to the jeweler. It takes a few seconds.',
    )
  })

  it('no text names a vendor, a build step or a sample stand-in', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'i18n', 'index.ts'), 'utf8')
    // `key: 'text',`, or the text alone on the line after a long key.
    const strings = [...source.matchAll(/^\s+(?:\w+:\s*)?(['"])(.*)\1,?$/gm)].map((match) => match[2])
    expect(strings.length).toBeGreaterThan(500)
    const developerNotes = strings.filter((text) =>
      /Tripo|Gemini|נחליף|בשלב 5|בשלב הבא|step 5|(next|later) step|will be built|יושלם בהמשך|sample model|מודל לדוגמה|call AI|קוראות ל-AI/i.test(text),
    )
    expect(developerNotes).toEqual([])
  })
})
