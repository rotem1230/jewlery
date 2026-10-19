import { apiGet, apiPost } from '@/src/lib/api'

export type JewelryPaymentIntent = {
  id: string
  status: string
  amount: number
  currency: string
  designId: string | null
  quoteId: string | null
  clientSecret: string
  provider?: string
  /** The Cardcom page the app opens (card payments). */
  paymentUrl?: string | null
  createdAt: string
}

/** The server charges the accepted quote's total; the client only names the quote. */
export function createJewelryPaymentIntent(payload: { quoteId: string }): Promise<JewelryPaymentIntent> {
  return apiPost<JewelryPaymentIntent>('/jewelry-payments/intents', payload)
}

export function getJewelryPaymentIntent(id: string, signal?: AbortSignal): Promise<JewelryPaymentIntent> {
  return apiGet<JewelryPaymentIntent>(`/jewelry-payments/intents/${id}`, { signal })
}
