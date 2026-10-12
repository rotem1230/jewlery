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
  createdAt: string
}

export function createJewelryPaymentIntent(payload: {
  amount: number
  currency: string
  designId?: string
  quoteId?: string
}): Promise<JewelryPaymentIntent> {
  return apiPost<JewelryPaymentIntent>('/jewelry-payments/intents', payload)
}

export function getJewelryPaymentIntent(id: string, signal?: AbortSignal): Promise<JewelryPaymentIntent> {
  return apiGet<JewelryPaymentIntent>(`/jewelry-payments/intents/${id}`, { signal })
}
