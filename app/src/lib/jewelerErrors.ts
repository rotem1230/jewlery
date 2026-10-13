import type { TranslationKey } from '@/src/i18n'
import { ApiError, apiErrorCode } from '@/src/lib/api'

export type JewelerAction = 'decline' | 'quote' | 'withdraw'

/** Server conflict codes the jeweler can act on, explained in Hebrew instead of the server's English. */
const BY_CODE: Record<string, TranslationKey> = {
  QUOTE_PENDING: 'jwDeclineQuotePending',
  ORDER_COMPLETED: 'jwDeclineOrderCompleted',
  DESIGN_EXPIRED: 'jwQuoteDesignExpired',
  DESIGN_CHANGED_SINCE_QUOTE: 'jwQuoteDesignChanged',
  DESIGN_NOT_PUBLISHED: 'jwQuoteDesignNotOpen',
  REQUEST_NOT_OPEN: 'jwQuoteRequestClosed',
  QUOTE_NOT_PENDING: 'jwQuoteNotPending',
}

/** The message for a failed jeweler action, or null to fall back to the generic one. */
export function jewelerErrorKey(err: unknown, action: JewelerAction): TranslationKey | null {
  const code = apiErrorCode(err)
  if (code && BY_CODE[code]) return BY_CODE[code]
  if (err instanceof ApiError && err.status === 404) {
    return action === 'decline' ? 'jwOrderNotFound' : 'jwListingUnavailableTitle'
  }
  return null
}

const RELOAD_CODES = new Set(['DESIGN_EXPIRED', 'DESIGN_CHANGED_SINCE_QUOTE', 'DESIGN_NOT_PUBLISHED', 'QUOTE_NOT_PENDING'])

/** The listing or the quote changed under the screen: reload it so the jeweler sees what is current. */
export function shouldReload(err: unknown): boolean {
  const code = apiErrorCode(err)
  return code !== undefined && RELOAD_CODES.has(code)
}
