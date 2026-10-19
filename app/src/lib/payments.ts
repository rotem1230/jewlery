/**
 * Paying for a plan by card (Cardcom): the payment page opens inside the app, closes on the
 * server's return page, and the plan starts once the server has confirmed the payment with Cardcom.
 */
import { apiErrorCode, parseApiError } from '@/src/lib/api'

type Locale = 'he' | 'en' | string

export type PaymentResult = 'success' | 'failed' | 'cancel'
export type CheckoutOutcome = 'COMPLETED' | 'NEEDS_REVIEW' | 'CANCELLED' | 'PENDING'

const RETURN_PATH = '/payments/cardcom/return'

/** The result of the server's return page (Cardcom sends the card holder there), else null. */
export function paymentReturn(url: string): PaymentResult | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (!parsed.pathname.endsWith(RETURN_PATH)) return null
  const result = parsed.searchParams.get('result')
  return result === 'success' || result === 'cancel' ? result : 'failed'
}

/**
 * Follows a checkout until the server confirms it (or keeps it for review, or withdraws it); after
 * `timeoutMs` the payment is still PENDING (the plan starts when Cardcom's confirmation arrives).
 */
export async function waitForCheckout(
  checkoutId: string,
  deps: {
    get: (id: string) => Promise<{ status: string }>
    sleep?: (ms: number) => Promise<void>
    now?: () => number
  },
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<CheckoutOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = deps.now ?? Date.now
  const interval = options.intervalMs ?? 2000
  const deadline = now() + (options.timeoutMs ?? 60_000)
  while (now() < deadline) {
    try {
      const { status } = await deps.get(checkoutId)
      if (status === 'COMPLETED' || status === 'NEEDS_REVIEW' || status === 'CANCELLED') return status
    } catch {
      // A failed look (network) is tried again until the time is up.
    }
    await sleep(interval)
  }
  return 'PENDING'
}

type PlanLike = { code: string; price: string | number }
type SubscriptionLike = { status: string; plan?: PlanLike | null } | null | undefined

const LIVE = ['TRIALING', 'ACTIVE', 'PAST_DUE']

/**
 * What a plan card offers: `choose` (no plan yet: a trial or the free plan, payment when needed),
 * `pay` (from a trial or a free plan to a paid plan), `current`, or `none` (a paid plan is live:
 * cancel it first).
 */
export function planAction(plan: PlanLike, subscription: SubscriptionLike): 'choose' | 'pay' | 'current' | 'none' {
  const live = subscription && LIVE.includes(subscription.status) ? subscription : null
  if (!live) return 'choose'
  const paidPlan = Number(plan.price) > 0
  const onTrial = live.status === 'TRIALING'
  const onFree = !onTrial && Number(live.plan?.price ?? 0) === 0
  if (live.plan?.code === plan.code && !onTrial) return 'current'
  if ((onTrial || onFree) && paidPlan) return 'pay'
  return 'none'
}

/** Payment cannot be taken right now (the provider is unreachable or not set up). */
export function paymentUnavailableMessage(locale: Locale): string {
  return locale === 'en' ? 'Payment is not available right now. Please try again in a moment.' : 'התשלום אינו זמין כרגע. נסו שוב בעוד רגע.'
}

/** Why a payment could not start, in the app language. */
export function checkoutErrorMessage(err: unknown, locale: Locale): string {
  const en = locale === 'en'
  switch (apiErrorCode(err)) {
    case 'PAYMENT_PROVIDER_UNAVAILABLE':
    case 'PAYMENT_PROVIDER_NOT_CONFIGURED':
      return paymentUnavailableMessage(locale)
    case 'SUBSCRIPTION_EXISTS':
      return en
        ? 'You already pay for a plan. Cancel it first to switch plans.'
        : 'כבר יש לך מנוי בתשלום. כדי לעבור מסלול יש לבטל קודם את המנוי הנוכחי.'
    default:
      return parseApiError(err)
  }
}
