/** Quotes endpoints (authenticated). */
import { apiGet, apiPatch, apiPost } from '@/src/lib/api'
import type { QuoteSummary } from '@/src/types/api'

export function createQuote(payload: {
  conversationId: string
  designId: string
  designRequestId?: string
  materialsCost: number
  laborCost: number
  laborHours?: number
  etaBusinessDays: number
  notes?: string
  currency?: string
}): Promise<QuoteSummary> {
  return apiPost<QuoteSummary>('/quotes', payload)
}

export function getQuote(id: string, signal?: AbortSignal): Promise<QuoteSummary> {
  return apiGet<QuoteSummary>(`/quotes/${id}`, { signal })
}

/**
 * Accepts on the exact terms the user saw: if the jeweler changed the price meanwhile, the server
 * refuses with 409 QUOTE_CHANGED (and the current terms) instead of accepting unseen terms.
 */
export function acceptQuote(quote: Pick<QuoteSummary, 'id' | 'totalPrice' | 'currency'>): Promise<QuoteSummary> {
  return apiPost<QuoteSummary>(`/quotes/${quote.id}/accept`, {
    expectedTotalPrice: Number(quote.totalPrice),
    expectedCurrency: quote.currency,
  })
}

export function updateQuote(
  id: string,
  payload: {
    materialsCost?: number
    laborCost?: number
    laborHours?: number
    etaBusinessDays?: number
  },
): Promise<QuoteSummary> {
  return apiPatch<QuoteSummary>(`/quotes/${id}`, payload)
}

export function declineQuote(id: string, note?: string): Promise<QuoteSummary> {
  return apiPost<QuoteSummary>(`/quotes/${id}/decline`, note ? { note } : {})
}
