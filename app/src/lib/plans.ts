/**
 * Plan cards built from the real catalog (`GET /subscriptions/plans`, PRD 5.8): the plan's own
 * name, its exact price with agorot in its currency, the billing interval, the trial, and what it
 * includes (its entitlements, named in the app language).
 */
import { apiErrorCode, parseApiError } from '@/src/lib/api'
import { currencySymbol, formatMoney } from '@/src/lib/format'
import type { PlanCatalog } from '@/src/types/api'

type Locale = 'he' | 'en' | string

export type PlanCard = {
  code: string
  title: string
  price: string
  period: string
  trial: string | null
  features: string[]
  current: boolean
}

const PERIODS: Record<string, { he: string; en: string }> = {
  MONTHLY: { he: 'לחודש', en: 'per month' },
  ANNUAL: { he: 'לשנה', en: 'per year' },
  PER_ITEM: { he: 'לפריט', en: 'per item' },
  PER_LEAD: { he: 'לליד', en: 'per lead' },
}

const ENTITLEMENTS: Record<string, { he: string; en: string }> = {
  no_watermark: { he: 'ייצוא ללא סימן מים', en: 'Exports without a watermark' },
  hd_export: { he: 'ייצוא תמונת HD', en: 'HD image export' },
  personal_visualization: { he: 'הדמיה על תמונה אישית', en: 'Try-on on your own photo' },
  verified_designer_badge: { he: 'תג "מעצב מאומת"', en: '"Verified designer" badge' },
  priority_cloud_processing: { he: 'תיעדוף בעיבוד בענן', en: 'Priority cloud processing' },
  warm_leads: { he: 'לידים חמים וממוקדים', en: 'Warm, targeted leads' },
  priority_routing: { he: 'עדיפות בהפניית בקשות', en: 'Priority request routing' },
  jeweler_crm: { he: 'מעקב ייצור (CRM)', en: 'Production tracking (CRM)' },
}

const HEBREW = /[֐-׿]/

function bullets(inclusions: unknown): string[] {
  const list = Array.isArray(inclusions)
    ? inclusions
    : inclusions && typeof inclusions === 'object' && Array.isArray((inclusions as { bullets?: unknown }).bullets)
      ? (inclusions as { bullets: unknown[] }).bullets
      : []
  return list.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function features(plan: PlanCatalog, locale: Locale): string[] {
  const en = locale === 'en'
  const symbol = currencySymbol(plan.currency)
  const lines: string[] = []
  if (plan.leadQuota > 0) {
    const per = plan.billingCycle === 'ANNUAL' ? (en ? 'per year' : 'בשנה') : en ? 'per month' : 'בחודש'
    lines.push(en ? `${plan.leadQuota} leads ${per}` : `${plan.leadQuota} לידים ${per}`)
  }
  if (plan.extraLeadPrice != null && Number(plan.extraLeadPrice) > 0) {
    const price = formatMoney(plan.extraLeadPrice, symbol)
    lines.push(en ? `${price} per extra lead` : `${price} לליד נוסף`)
  }
  for (const row of plan.entitlements ?? []) {
    const label = row.entitlement?.key ? ENTITLEMENTS[row.entitlement.key] : undefined
    if (label) lines.push(en ? label.en : label.he)
  }
  // The admin's own bullets: in the app language, or as they are when nothing else describes the plan.
  const own = bullets(plan.inclusions)
  const inLanguage = own.filter((line) => (en ? !HEBREW.test(line) : HEBREW.test(line)))
  return [...lines, ...(lines.length === 0 ? own : inLanguage)]
}

export function planCards(
  plans: PlanCatalog[],
  options: { role: 'DESIGNER' | 'JEWELER'; locale: Locale; currentPlanCode?: string | null },
): PlanCard[] {
  const en = options.locale === 'en'
  return plans
    .filter((plan) => plan.role === options.role)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((plan) => {
      const free = Number(plan.price) === 0
      const period = PERIODS[plan.billingCycle]
      return {
        code: plan.code,
        title: en && plan.nameEn ? plan.nameEn : plan.nameHe,
        price: free ? (en ? 'Free' : 'חינם') : formatMoney(plan.price, currencySymbol(plan.currency)),
        period: free ? '' : period ? (en ? period.en : period.he) : '',
        trial: plan.trialDays > 0 ? (en ? `${plan.trialDays}-day free trial` : `${plan.trialDays} ימי ניסיון חינם`) : null,
        features: features(plan, options.locale),
        current: Boolean(options.currentPlanCode) && plan.code === options.currentPlanCode,
      }
    })
}

/** Why subscribing was refused, in the app language. */
export function subscribeErrorMessage(err: unknown, locale: Locale): string {
  const en = locale === 'en'
  switch (apiErrorCode(err)) {
    case 'PAYMENT_REQUIRED':
      return en
        ? 'This plan requires payment, and in-app payment is not available yet.'
        : 'מסלול זה דורש תשלום, והתשלום בתוך האפליקציה עדיין אינו זמין.'
    case 'SUBSCRIPTION_EXISTS':
      return en
        ? 'You already have an active subscription. Cancel it first to switch plans.'
        : 'כבר יש לך מנוי פעיל. כדי לעבור מסלול יש לבטל קודם את המנוי הנוכחי.'
    default:
      return parseApiError(err)
  }
}
