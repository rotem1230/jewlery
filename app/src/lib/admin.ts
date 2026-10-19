/** The admin screens' logic: report ranges, labels, the plan form and refund requests. */
import type { AdminPlan, PlanPayload } from '@/src/api/admin'
import { currencySymbol, formatMoney } from '@/src/lib/format'

type Locale = 'he' | 'en' | string
const DAY_MS = 24 * 60 * 60 * 1000

export type RangeKind = 'this_month' | 'last_month' | 'last_90_days'

/** The dates a report covers (UTC). */
export function reportRange(kind: RangeKind, now: Date = new Date()): { from: string; to: string } {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  if (kind === 'last_month') {
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    return { from: previous.toISOString(), to: monthStart.toISOString() }
  }
  if (kind === 'last_90_days') {
    return { from: new Date(now.getTime() - 90 * DAY_MS).toISOString(), to: now.toISOString() }
  }
  return { from: monthStart.toISOString(), to: now.toISOString() }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

const ALERTS: Record<string, { he: string; en: string }> = {
  AI_QUOTA_80: { he: 'ניצל/ה 80% ממכסת יצירות ה-AI', en: 'Used 80% of the AI creations' },
  AI_QUOTA_REACHED: { he: 'הגיע/ה למכסת יצירות ה-AI', en: 'Reached the AI creations quota' },
  AI_DAILY_LIMIT: { he: 'הגיע/ה למגבלה היומית', en: 'Reached the daily limit' },
}

export function alertLabel(kind: string, locale: Locale): string {
  const label = ALERTS[kind]
  return label ? (locale === 'en' ? label.en : label.he) : kind
}

/** What a payout still asks for: a transfer to the jeweler, or money to recover after a refund. */
export function payoutDueLabel(due: number, currency: string, locale: Locale): string {
  const en = locale === 'en'
  const amount = formatMoney(Math.abs(due), currencySymbol(currency))
  if (due > 0) return en ? `To transfer to the jeweler: ${amount}` : `להעביר לצורף: ${amount}`
  if (due < 0) return en ? `To recover from the jeweler: ${amount}` : `לגבות מהצורף: ${amount}`
  return en ? 'Nothing due' : 'אין יתרה'
}

export type PlanForm = {
  nameHe: string
  nameEn: string
  billingCycle: string
  price: string
  trialDays: string
  leadQuota: string
  aiRenders: string
  unlimited: boolean
  isActive: boolean
  features: string[]
  bulletsHe: string
}

export function planToForm(plan: AdminPlan): PlanForm {
  return {
    nameHe: plan.nameHe,
    nameEn: plan.nameEn ?? '',
    billingCycle: plan.billingCycle,
    price: String(plan.price),
    trialDays: String(plan.trialDays),
    leadQuota: String(plan.leadQuota),
    aiRenders: plan.aiRenders === null ? '' : String(plan.aiRenders),
    unlimited: plan.unlimited,
    isActive: plan.isActive,
    features: [...plan.features],
    bulletsHe: plan.bulletsHe.join('\n'),
  }
}

export const EMPTY_PLAN_FORM: PlanForm = {
  nameHe: '',
  nameEn: '',
  billingCycle: 'MONTHLY',
  price: '',
  trialDays: '0',
  leadQuota: '0',
  aiRenders: '',
  unlimited: false,
  isActive: true,
  features: [],
  bulletsHe: '',
}

const WHOLE = /^\d+$/
const MONEY = /^\d+(\.\d{1,2})?$/

/** The plan as the server takes it, or what is wrong with the form (Hebrew). */
export function formToPlanPayload(form: PlanForm): { payload: PlanPayload | null; errors: Partial<Record<keyof PlanForm, string>> } {
  const errors: Partial<Record<keyof PlanForm, string>> = {}
  const nameHe = form.nameHe.trim()
  if (!nameHe) errors.nameHe = 'שדה חובה'
  const price = form.price.trim()
  if (!MONEY.test(price)) errors.price = 'מחיר: מספר מ-0 ומעלה (עד שתי ספרות אחרי הנקודה)'
  const trialDays = form.trialDays.trim()
  if (!WHOLE.test(trialDays) || Number(trialDays) > 90) errors.trialDays = 'מספר שלם מ-0 עד 90'
  const leadQuota = form.leadQuota.trim()
  if (!WHOLE.test(leadQuota) || Number(leadQuota) > 1000) errors.leadQuota = 'מספר שלם מ-0 עד 1000'
  const aiRenders = form.aiRenders.trim()
  if (aiRenders && !WHOLE.test(aiRenders)) errors.aiRenders = 'מספר שלם מ-0 ומעלה, או ריק'
  if (Object.keys(errors).length > 0) return { payload: null, errors }
  return {
    errors: {},
    payload: {
      nameHe,
      nameEn: form.nameEn.trim(),
      billingCycle: form.billingCycle,
      price: Number(price),
      trialDays: Number(trialDays),
      leadQuota: Number(leadQuota),
      aiRenders: aiRenders ? Number(aiRenders) : null,
      unlimited: form.unlimited,
      isActive: form.isActive,
      features: [...form.features].sort(),
      bulletsHe: form.bulletsHe
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    },
  }
}

/** A refund the admin asks for: the whole remaining amount when empty; never more than is left. */
export function refundRequest(amountText: string, refundable: number, reason: string): { body?: { amount?: number; reason: string }; error?: string } {
  const why = reason.trim()
  if (!why) return { error: 'יש לכתוב סיבה' }
  const text = amountText.trim()
  if (!text) return { body: { reason: why } }
  if (!MONEY.test(text) || Number(text) <= 0) return { error: 'סכום לא תקין' }
  const amount = Number(text)
  if (Math.round(amount * 100) > Math.round(refundable * 100)) return { error: `אפשר להחזיר עד ${formatMoney(refundable)}` }
  return { body: { amount, reason: why } }
}

/** A random id (v4) for one refund request: sent again on a double tap, it is the same refund. */
export function newRequestId(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const variant = '89ab'[Math.floor(Math.random() * 4)]
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`
}

const GRACE_DAYS = 7

/** dd.mm.yyyy in the device's time zone. */
function shortDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

type ValidityLike = { status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string; trialEndsAt: string | null }

/** Until when a plan holds and whether it renews (or why it does not hold any more). */
export function subscriptionValidity(sub: ValidityLike, locale: Locale, now: Date = new Date()): string {
  const en = locale === 'en'
  const periodEnd = new Date(sub.currentPeriodEnd)
  const left = (end: Date) => {
    const days = Math.ceil((end.getTime() - now.getTime()) / DAY_MS)
    if (days <= 1 && end.toDateString() === now.toDateString()) return en ? 'ends today' : 'מסתיים היום'
    return en ? `${days} days left` : `עוד ${days} ימים`
  }
  switch (sub.status) {
    case 'TRIALING': {
      const end = new Date(sub.trialEndsAt ?? sub.currentPeriodEnd)
      return en ? `Trial until ${shortDate(end)} (${left(end)})` : `ניסיון עד ${shortDate(end)} (${left(end)})`
    }
    case 'ACTIVE':
      if (sub.cancelAtPeriodEnd) {
        return en ? `Ends ${shortDate(periodEnd)} (${left(periodEnd)}) · does not renew` : `מסתיים ב-${shortDate(periodEnd)} (${left(periodEnd)}) · לא יתחדש`
      }
      return en ? `Valid until ${shortDate(periodEnd)} (${left(periodEnd)})` : `בתוקף עד ${shortDate(periodEnd)} (${left(periodEnd)})`
    case 'PAST_DUE': {
      const grace = new Date(periodEnd.getTime() + GRACE_DAYS * DAY_MS)
      return en ? `Payment failed · grace period until ${shortDate(grace)}` : `התשלום נכשל · בתקופת חסד עד ${shortDate(grace)}`
    }
    case 'EXPIRED':
      return en ? `Expired ${shortDate(periodEnd)}` : `פג תוקף ב-${shortDate(periodEnd)}`
    case 'CANCELLED':
      return en ? 'Cancelled' : 'בוטל'
    default:
      return sub.status
  }
}

export type LeadCountsView = { quota: number; total: number; used: number; reserved: number; available: number; refunded: number }

/** A jeweler's leads this period: used of all (the plan's and any added), left, and held for open requests. */
export function leadsLabel(leads: LeadCountsView, locale: Locale): string {
  if (locale === 'en') {
    const extra = leads.total !== leads.quota ? ` (${leads.quota} in the plan)` : ''
    const held = leads.reserved > 0 ? ` · ${leads.reserved} held` : ''
    return `Leads: ${leads.used} of ${leads.total}${extra} used · ${leads.available} left${held}`
  }
  const extra = leads.total !== leads.quota ? ` (${leads.quota} בחבילה)` : ''
  const held = leads.reserved > 0 ? ` · שמורים ${leads.reserved}` : ''
  return `לידים: נוצלו ${leads.used} מתוך ${leads.total}${extra} · נשארו ${leads.available}${held}`
}

/** An admin action on a plan (days to add, leads to add): a whole number from 1 to max, and a reason. */
export function adminActionRequest(
  valueText: string,
  reason: string,
  max: number,
): { body?: { value: number; reason: string }; error?: string; field?: 'value' | 'reason' } {
  const why = reason.trim()
  const text = valueText.trim()
  const value = Number(text)
  if (!/^\d+$/.test(text) || value < 1 || value > max) return { error: `מספר שלם בין 1 ל-${max}`, field: 'value' }
  if (!why) return { error: 'יש לכתוב סיבה', field: 'reason' }
  return { body: { value, reason: why } }
}
