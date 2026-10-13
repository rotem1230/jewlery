import { ApiError } from '../src/lib/api'
import { jewelerErrorKey, shouldReload } from '../src/lib/jewelerErrors'

function conflict(code: string, path = '/quotes') {
  return new ApiError(409, path, JSON.stringify({ success: false, message: 'English server text', code }))
}

describe('Hebrew messages for the jeweler’s conflicts', () => {
  it('asks to withdraw the quote before declining a request', () => {
    expect(jewelerErrorKey(conflict('QUOTE_PENDING'), 'decline')).toBe('jwDeclineQuotePending')
    expect(jewelerErrorKey(conflict('ORDER_COMPLETED'), 'decline')).toBe('jwDeclineOrderCompleted')
    expect(jewelerErrorKey(new ApiError(404, '/jeweler-profiles/me/orders/r1/decline', '{}'), 'decline')).toBe(
      'jwOrderNotFound',
    )
  })

  it('explains an ended listing and a design changed after pricing', () => {
    expect(jewelerErrorKey(conflict('DESIGN_EXPIRED'), 'quote')).toBe('jwQuoteDesignExpired')
    expect(jewelerErrorKey(conflict('DESIGN_CHANGED_SINCE_QUOTE'), 'quote')).toBe('jwQuoteDesignChanged')
    expect(jewelerErrorKey(conflict('DESIGN_NOT_PUBLISHED'), 'quote')).toBe('jwQuoteDesignNotOpen')
    expect(jewelerErrorKey(conflict('REQUEST_NOT_OPEN'), 'quote')).toBe('jwQuoteRequestClosed')
    expect(jewelerErrorKey(new ApiError(404, '/quotes', '{}'), 'quote')).toBe('jwListingUnavailableTitle')
  })

  it('explains a quote that is no longer pending', () => {
    expect(jewelerErrorKey(conflict('QUOTE_NOT_PENDING'), 'withdraw')).toBe('jwQuoteNotPending')
    expect(jewelerErrorKey(conflict('QUOTE_NOT_PENDING'), 'quote')).toBe('jwQuoteNotPending')
  })

  it('leaves anything else to the generic message', () => {
    expect(jewelerErrorKey(new ApiError(500, '/quotes', 'boom'), 'quote')).toBeNull()
    expect(jewelerErrorKey(new Error('offline'), 'decline')).toBeNull()
  })

  it('reloads the screen when the listing or the quote changed under it', () => {
    expect(shouldReload(conflict('DESIGN_EXPIRED'))).toBe(true)
    expect(shouldReload(conflict('DESIGN_CHANGED_SINCE_QUOTE'))).toBe(true)
    expect(shouldReload(conflict('QUOTE_NOT_PENDING'))).toBe(true)
    expect(shouldReload(conflict('REQUEST_NOT_OPEN'))).toBe(false)
  })
})
