import { navRowDirection } from '../src/lib/rtl'

describe('bottom navigation order', () => {
  it('runs right to left in Hebrew: the first tab (Home) sits on the right edge', () => {
    expect(navRowDirection('he')).toBe('row-reverse')
  })

  it('runs left to right in English', () => {
    expect(navRowDirection('en')).toBe('row')
  })
})
