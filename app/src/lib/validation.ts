/** Client-side checks that mirror backend DTO / password-policy rules. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/** Backend policy: min 8, at least one letter (any alphabet, Hebrew included), at least one number. */
export function passwordIssue(
  password: string,
): 'empty' | 'short' | 'letter' | 'number' | null {
  if (!password) return 'empty'
  if (password.length < 8) return 'short'
  if (!/\p{L}/u.test(password)) return 'letter'
  if (!/\d/.test(password)) return 'number'
  return null
}

export function parseNonNegativeNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

/** Israeli local / E.164-ish phone → `+972…`. Returns null if too short. */
export function toE164Phone(raw: string, countryCode = '+972'): string | null {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  const cc = countryCode.replace(/\D/g, '') || '972'
  let national = digits
  if (national.startsWith(cc)) national = national.slice(cc.length)
  if (national.startsWith('0')) national = national.slice(1)
  if (national.length < 8 || national.length > 10) return null
  return `+${cc}${national}`
}
