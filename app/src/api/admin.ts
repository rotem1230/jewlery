/** Admin endpoints (role ADMIN): plans, reports, payments and refunds, jewelry payouts. */
import { apiGet, apiPatch, apiPost, buildQuery } from '@/src/lib/api'

export type AdminPlan = {
  id: string
  code: string
  role: 'DESIGNER' | 'JEWELER'
  nameHe: string
  nameEn: string | null
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | string
  price: number
  currency: string
  trialDays: number
  leadQuota: number
  extraLeadPrice: number | null
  sortOrder: number
  isActive: boolean
  bulletsHe: string[]
  bulletsEn: string[]
  features: string[]
  aiRenders: number | null
  unlimited: boolean
  liveSubscribers: number
}

export type PlanPayload = Partial<
  Pick<AdminPlan, 'nameHe' | 'nameEn' | 'billingCycle' | 'price' | 'trialDays' | 'leadQuota' | 'isActive' | 'features' | 'aiRenders' | 'unlimited' | 'bulletsHe'>
>

export type RefundView = {
  id: string
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | string
  amount: number
  currency: string
  reason: string
  failureReason: string | null
  createdAt: string
}

export type PersonRef = { id: string; email: string; name: string | null }

export type PlanPayment = {
  id: string
  paidAt: string
  amount: number
  currency: string
  provider: string | null
  user: PersonRef
  plan: { code: string; nameHe: string }
  refunded: number
  refundable: number
  refunds: RefundView[]
}

export type JewelryPayment = {
  id: string
  status: string
  amount: number
  currency: string
  paidAt: string | null
  designer: PersonRef | null
  jeweler: PersonRef | null
  refunded: number
  refundable: number
  refunds: RefundView[]
  payoutStatus: string | null
}

export type Payout = {
  id: string
  paymentId: string
  status: 'OWED' | 'PAID' | 'CANCELLED' | string
  currency: string
  gross: number
  commission: number
  net: number
  refunded: number
  due: number
  paidAt: string | null
  paidReference: string | null
  createdAt: string
  jeweler: PersonRef & { businessName: string | null; phone: string | null }
}

export type ReviewItem = {
  id: string
  type: string
  note: string | null
  amount: number | null
  currency: string | null
  checkoutId: string | null
  transactionId: string | null
  processedAt: string
}

export type Assumptions = { aiImageCostIls: number; storageIlsPerGbMonth: number; trafficIlsPerGb: number; cardFeePercent: number }

export type FinanceRow = {
  code: string
  nameHe: string
  role: string
  activeSubscribers: number
  payments: number
  revenue: number
  refunds: number
  cardFees: number
  aiCost: number
  storageCost: number
  trafficCost: number
  net: number
}

export type FinanceReport = {
  from: string
  to: string
  assumptions: Assumptions
  plans: FinanceRow[]
  jewelry: {
    payments: number
    gross: number
    refunds: number
    cardFees: number
    commission: number
    owedToJewelers: number
    transferredToJewelers: number
    toRecoverFromJewelers: number
  }
  totals: { revenue: number; refunds: number; cardFees: number; aiCost: number; storageCost: number; trafficCost: number; net: number; jewelryCommission: number }
}

export type UsageRow = {
  user: PersonRef
  plan: { code: string; nameHe: string } | null
  aiCreations: number
  aiCost: number
  storageBytes: number
  storageCost: number
  trafficBytes: number
  trafficCost: number
  totalCost: number
  revenue: number
  refunds: number
  alerts: Array<{ kind: string; at: string }>
}

export type UsageReport = { from: string; to: string; assumptions: Assumptions; users: UsageRow[] }

export type Range = { from: string; to: string }

export const listAdminPlans = (signal?: AbortSignal) => apiGet<AdminPlan[]>('/admin/plans', { signal })
export const listPlanFeatures = (signal?: AbortSignal) => apiGet<Array<{ key: string; description: string }>>('/admin/plans/features', { signal })
export const createAdminPlan = (body: PlanPayload & { code: string; role: 'DESIGNER' | 'JEWELER' }) => apiPost<AdminPlan>('/admin/plans', body)
export const updateAdminPlan = (code: string, body: PlanPayload) => apiPatch<AdminPlan>(`/admin/plans/${encodeURIComponent(code)}`, body)

export const financeReport = (range: Range, signal?: AbortSignal) => apiGet<FinanceReport>(`/admin/reports/finance${buildQuery(range)}`, { signal })
export const usageReport = (range: Range, signal?: AbortSignal) => apiGet<UsageReport>(`/admin/reports/usage${buildQuery(range)}`, { signal })

export const listPlanPayments = (signal?: AbortSignal) => apiGet<PlanPayment[]>('/admin/payments/invoices', { signal })
export const refundPlanPayment = (id: string, body: { amount?: number; reason: string; endSubscription?: boolean; requestId: string }) =>
  apiPost<RefundView>(`/admin/payments/invoices/${encodeURIComponent(id)}/refunds`, body)
export const resolveRefund = (id: string, outcome: 'SUCCEEDED' | 'FAILED') => apiPost<RefundView>(`/admin/refunds/${encodeURIComponent(id)}/resolve`, { outcome })
export const listReviewItems = (signal?: AbortSignal) => apiGet<ReviewItem[]>('/admin/payments/review', { signal })

export const listJewelryPayments = (signal?: AbortSignal) => apiGet<JewelryPayment[]>('/admin/jewelry-payments', { signal })
export const refundJewelryPayment = (id: string, body: { amount?: number; reason: string; requestId: string }) =>
  apiPost<RefundView>(`/admin/jewelry-payments/${encodeURIComponent(id)}/refunds`, body)
export const listPayouts = (status: 'OWED' | 'PAID' | 'CANCELLED', signal?: AbortSignal) =>
  apiGet<Payout[]>(`/admin/jewelry-payouts${buildQuery({ status })}`, { signal })
export const markPayoutPaid = (id: string, reference: string) => apiPost<{ id: string; status: string }>(`/admin/jewelry-payouts/${encodeURIComponent(id)}/mark-paid`, { reference })
