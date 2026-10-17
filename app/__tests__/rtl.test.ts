import { isolate, ltrIsolate, navRowDirection } from '../src/lib/rtl'

describe('bottom navigation order', () => {
  it('runs right to left in Hebrew: the first tab (Home) sits on the right edge', () => {
    expect(navRowDirection('he')).toBe('row-reverse')
  })

  it('runs left to right in English', () => {
    expect(navRowDirection('en')).toBe('row')
  })
})

describe('left-to-right tokens inside Hebrew text', () => {
  const LRI = String.fromCharCode(0x2066)
  const FSI = String.fromCharCode(0x2068)
  const PDI = String.fromCharCode(0x2069)

  it('an e-mail or URL is isolated as one left-to-right run', () => {
    expect(ltrIsolate('qa.designer@malinvosky.test')).toBe(`${LRI}qa.designer@malinvosky.test${PDI}`)
  })

  it('a name or title with Latin letters or digits is isolated; Hebrew text is left as it is', () => {
    expect(isolate('QA Goldsmith')).toBe(`${FSI}QA Goldsmith${PDI}`)
    expect(isolate('₪ 4,500')).toBe(`${FSI}₪ 4,500${PDI}`)
    expect(isolate('צורפות כהן')).toBe('צורפות כהן')
  })
})
