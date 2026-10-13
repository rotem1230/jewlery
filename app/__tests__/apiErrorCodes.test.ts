import { ApiError, apiErrorCode, knownApiErrorMessage, parseApiError } from '../src/lib/api'

function apiError(status: number, body: Record<string, unknown>): ApiError {
  return new ApiError(status, '/x', JSON.stringify({ success: false, ...body }))
}

describe('error codes the server explains in Hebrew', () => {
  it.each([
    ['DESIGN_EXPIRED', 409, 'This listing has expired', 'תקופת הפרסום של העיצוב הסתיימה'],
    [
      'DESIGN_CHANGED_SINCE_QUOTE',
      409,
      'The design changed after this quote was made; ask the jeweler to update the quote',
      'העיצוב השתנה אחרי שהצעת המחיר תומחרה. בקשו מהצורף לעדכן את ההצעה',
    ],
    ['QUOTE_EXPIRED', 409, 'This quote has expired', 'תוקף הצעת המחיר פג'],
    ['QUOTE_NOT_PENDING', 409, 'This quote is no longer pending', 'הצעת המחיר כבר אינה ממתינה לתשובה'],
    ['QUOTE_PENDING', 409, 'Withdraw your quote before declining the request', 'יש לבטל את הצעת המחיר שלך לפני דחיית הבקשה'],
    ['ORDER_COMPLETED', 409, 'This order is completed', 'ההזמנה כבר הושלמה'],
    ['PAYWALL', 403, 'Entitlement "x" is required', 'הפעולה זמינה במנוי בתשלום'],
    ['FEATURE_DISABLED', 403, 'Visualization is not enabled', 'האפשרות תהיה זמינה בקרוב'],
    [
      'DESIGN_COMPLETED',
      409,
      'This design already has an accepted quote; duplicate it to start a new one',
      'לעיצוב כבר אושרה הצעת מחיר ולכן לא ניתן לשנות אותו. אפשר לשכפל אותו ולהתחיל מחדש',
    ],
    ['DESIGN_NOT_PUBLISHED', 403, 'This design is not open for quotes', 'העיצוב אינו מפורסם כרגע'],
    ['REQUEST_NOT_OPEN', 409, 'The design request is no longer open', 'הבקשה כבר אינה פתוחה'],
  ])('%s is shown as a Hebrew explanation instead of the English server message', (code, status, message, hebrew) => {
    const err = apiError(status, { message, code })
    expect(apiErrorCode(err)).toBe(code)
    expect(parseApiError(err)).toBe(hebrew)
    expect(knownApiErrorMessage(err)).toBe(hebrew)
  })

  it('an unknown code keeps the server message (generic fallback unchanged)', () => {
    const err = apiError(409, { message: 'Quote changed', code: 'QUOTE_CHANGED' })
    expect(parseApiError(err)).toBe('Quote changed')
    expect(knownApiErrorMessage(err)).toBeUndefined()
  })

  it('errors without a code, network failures and non-API errors fall back as before', () => {
    expect(parseApiError(apiError(400, { message: 'title is too long' }))).toBe('title is too long')
    expect(knownApiErrorMessage(new ApiError(0, '/x', 'Network request failed'))).toBeUndefined()
    expect(parseApiError(new ApiError(0, '/x', 'Network request failed'))).toBe('Network request failed')
    expect(knownApiErrorMessage(new Error('boom'))).toBeUndefined()
    expect(parseApiError(new Error('boom'))).toBe('boom')
    expect(parseApiError(undefined)).toBe('Request failed')
  })
})
