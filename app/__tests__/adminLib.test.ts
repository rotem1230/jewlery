import {
  adminActionRequest,
  alertLabel,
  formatBytes,
  leadsLabel,
  formToPlanPayload,
  newRequestId,
  payoutDueLabel,
  planToForm,
  refundRequest,
  reportRange,
  subscriptionValidity,
} from '../src/lib/admin'
import type { AdminPlan } from '../src/api/admin'

const plan: AdminPlan = {
  id: 'p1',
  code: 'DESIGNER_PREMIUM_QUARTERLY',
  role: 'DESIGNER',
  nameHe: 'מעצב/ת - פרימיום רבעוני',
  nameEn: 'Designer Premium Quarterly',
  billingCycle: 'QUARTERLY',
  price: 45,
  currency: 'ILS',
  trialDays: 14,
  leadQuota: 0,
  extraLeadPrice: null,
  sortOrder: 2,
  isActive: true,
  bulletsHe: ['כל יכולות הפרימיום'],
  bulletsEn: [],
  features: ['hd_export', 'no_watermark'],
  aiRenders: 150,
  unlimited: false,
  liveSubscribers: 3,
}

describe('report ranges', () => {
  const now = new Date(Date.UTC(2026, 9, 19, 15, 30))

  it('this month, last month and the last 90 days', () => {
    expect(reportRange('this_month', now)).toEqual({ from: '2026-10-01T00:00:00.000Z', to: now.toISOString() })
    expect(reportRange('last_month', now)).toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' })
    expect(reportRange('last_90_days', now).from).toBe(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString())
  })

  it('last month of January is December of the year before', () => {
    expect(reportRange('last_month', new Date(Date.UTC(2027, 0, 5)))).toEqual({ from: '2026-12-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' })
  })
})

describe('labels', () => {
  it('sizes in B / KB / MB / GB', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3.25 * 1024 ** 3)).toBe('3.3 GB')
  })

  it('fair-use alerts in Hebrew', () => {
    expect(alertLabel('AI_QUOTA_80', 'he')).toBe('ניצל/ה 80% ממכסת יצירות ה-AI')
    expect(alertLabel('AI_QUOTA_REACHED', 'he')).toBe('הגיע/ה למכסת יצירות ה-AI')
    expect(alertLabel('AI_DAILY_LIMIT', 'he')).toBe('הגיע/ה למגבלה היומית')
    expect(alertLabel('SOMETHING_NEW', 'he')).toBe('SOMETHING_NEW')
  })

  it('what a payout still asks for', () => {
    expect(payoutDueLabel(1350, 'ILS', 'he')).toBe('להעביר לצורף: ₪ 1,350')
    expect(payoutDueLabel(-200, 'ILS', 'he')).toBe('לגבות מהצורף: ₪ 200')
    expect(payoutDueLabel(0, 'ILS', 'he')).toBe('אין יתרה')
  })
})

describe('the plan form', () => {
  it('fills from a plan and gives back the same plan', () => {
    const form = planToForm(plan)
    expect(form).toMatchObject({ price: '45', trialDays: '14', aiRenders: '150', bulletsHe: 'כל יכולות הפרימיום' })
    expect(formToPlanPayload(form)).toEqual({
      errors: {},
      payload: {
        nameHe: plan.nameHe,
        nameEn: plan.nameEn,
        billingCycle: 'QUARTERLY',
        price: 45,
        trialDays: 14,
        leadQuota: 0,
        aiRenders: 150,
        unlimited: false,
        isActive: true,
        features: ['hd_export', 'no_watermark'],
        bulletsHe: ['כל יכולות הפרימיום'],
      },
    })
  })

  it('an empty AI quota means the free plan’s; bullets are one per line', () => {
    const { payload } = formToPlanPayload({ ...planToForm(plan), aiRenders: ' ', bulletsHe: 'שורה א\n\n  שורה ב  ' })
    expect(payload?.aiRenders).toBeNull()
    expect(payload?.bulletsHe).toEqual(['שורה א', 'שורה ב'])
  })

  it('explains what is wrong, in Hebrew', () => {
    const { errors, payload } = formToPlanPayload({ ...planToForm(plan), nameHe: ' ', price: '-3', trialDays: '1.5', aiRenders: 'הרבה' })
    expect(payload).toBeNull()
    expect(errors).toEqual({
      nameHe: 'שדה חובה',
      price: 'מחיר: מספר מ-0 ומעלה (עד שתי ספרות אחרי הנקודה)',
      trialDays: 'מספר שלם מ-0 עד 90',
      aiRenders: 'מספר שלם מ-0 ומעלה, או ריק',
    })
  })
})

describe('a refund request', () => {
  it('empty amount = everything that is left; a reason is required; never more than is left', () => {
    expect(refundRequest('', 45, 'ביטול')).toEqual({ body: { reason: 'ביטול' } })
    expect(refundRequest('20.5', 45, 'פיצוי')).toEqual({ body: { amount: 20.5, reason: 'פיצוי' } })
    expect(refundRequest('50', 45, 'x').error).toBe('אפשר להחזיר עד ₪ 45')
    expect(refundRequest('0', 45, 'x').error).toBe('סכום לא תקין')
    expect(refundRequest('', 45, '  ').error).toBe('יש לכתוב סיבה')
  })

  it('each request gets its own id (a double tap sends the same one)', () => {
    const a = newRequestId()
    const b = newRequestId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })
})

describe("a plan's validity and leads", () => {
  // Noon UTC: the same calendar day in Israel and in UTC.
  const now = new Date(Date.UTC(2026, 9, 20, 12))
  const sub = (overrides: Record<string, unknown>) => ({
    status: 'ACTIVE',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date(Date.UTC(2027, 0, 18, 12)).toISOString(),
    trialEndsAt: null,
    ...overrides,
  })

  it('says until when the plan holds, and whether it renews', () => {
    expect(subscriptionValidity(sub({}), 'he', now)).toBe('בתוקף עד 18.01.2027 (עוד 90 ימים)')
    expect(subscriptionValidity(sub({ cancelAtPeriodEnd: true }), 'he', now)).toBe('מסתיים ב-18.01.2027 (עוד 90 ימים) · לא יתחדש')
    expect(subscriptionValidity(sub({ status: 'TRIALING', trialEndsAt: new Date(Date.UTC(2026, 9, 23, 12)).toISOString() }), 'he', now)).toBe(
      'ניסיון עד 23.10.2026 (עוד 3 ימים)',
    )
    expect(subscriptionValidity(sub({ currentPeriodEnd: new Date(Date.UTC(2026, 9, 20, 18)).toISOString() }), 'he', now)).toBe('בתוקף עד 20.10.2026 (מסתיים היום)')
    expect(subscriptionValidity(sub({}), 'en', now)).toBe('Valid until 18.01.2027 (90 days left)')
  })

  it('a failed payment shows the grace period; an ended plan says so', () => {
    const ended = new Date(Date.UTC(2026, 9, 18, 12)).toISOString()
    expect(subscriptionValidity(sub({ status: 'PAST_DUE', currentPeriodEnd: ended }), 'he', now)).toBe('התשלום נכשל · בתקופת חסד עד 25.10.2026')
    expect(subscriptionValidity(sub({ status: 'EXPIRED', currentPeriodEnd: ended }), 'he', now)).toBe('פג תוקף ב-18.10.2026')
    expect(subscriptionValidity(sub({ status: 'CANCELLED' }), 'he', now)).toBe('בוטל')
  })

  it("a jeweler's leads: used of all this period, what is left and what is held", () => {
    expect(leadsLabel({ quota: 10, total: 10, used: 3, reserved: 0, available: 7, refunded: 0 }, 'he')).toBe('לידים: נוצלו 3 מתוך 10 · נשארו 7')
    expect(leadsLabel({ quota: 10, total: 15, used: 3, reserved: 1, available: 11, refunded: 0 }, 'he')).toBe(
      'לידים: נוצלו 3 מתוך 15 (10 בחבילה) · נשארו 11 · שמורים 1',
    )
    expect(leadsLabel({ quota: 10, total: 10, used: 10, reserved: 0, available: 0, refunded: 0 }, 'en')).toBe('Leads: 10 of 10 used · 0 left')
  })

  it('an admin action needs a whole number in range and a reason', () => {
    expect(adminActionRequest('30', 'פיצוי', 365)).toEqual({ body: { value: 30, reason: 'פיצוי' } })
    expect(adminActionRequest('0', 'x', 365).error).toBe('מספר שלם בין 1 ל-365')
    expect(adminActionRequest('2.5', 'x', 100).error).toBe('מספר שלם בין 1 ל-100')
    expect(adminActionRequest('400', 'x', 365).error).toBe('מספר שלם בין 1 ל-365')
    expect(adminActionRequest('5', ' ', 100).error).toBe('יש לכתוב סיבה')
  })
})
