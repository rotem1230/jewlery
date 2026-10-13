import { passwordIssue } from '../src/lib/validation'

describe('password policy on the client (PRD 5.1: min 8, a letter and a number)', () => {
  it('counts Hebrew letters as letters', () => {
    expect(passwordIssue('סיסמהטובה1')).toBeNull()
    expect(passwordIssue('12345678א')).toBeNull()
  })

  it('counts other alphabets and Latin letters as letters too', () => {
    expect(passwordIssue('пароль123')).toBeNull()
    expect(passwordIssue('Designer123')).toBeNull()
  })

  it('still requires a letter, a number and the minimum length', () => {
    expect(passwordIssue('')).toBe('empty')
    expect(passwordIssue('אבג1')).toBe('short')
    expect(passwordIssue('12345678!')).toBe('letter')
    expect(passwordIssue('סיסמהארוכה')).toBe('number')
  })
})
