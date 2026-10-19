import type { PlanCatalog } from '../src/types/api'
import { aiQuotaMessage, planCards, subscribeErrorMessage } from '../src/lib/plans'
import { ApiError } from '../src/lib/api'

function plan(overrides: Partial<PlanCatalog>): PlanCatalog {
  return {
    id: overrides.code ?? 'p',
    code: 'DESIGNER_PRO',
    role: 'DESIGNER',
    nameHe: 'מעצב/ת - פרו',
    nameEn: 'Designer Pro',
    billingCycle: 'MONTHLY',
    price: '49.9',
    currency: 'ILS',
    leadQuota: 0,
    extraLeadPrice: null,
    trialDays: 14,
    inclusions: { bullets: ['No watermark exports', 'HD export'] },
    sortOrder: 2,
    entitlements: [{ entitlement: { key: 'no_watermark' } }, { entitlement: { key: 'hd_export' } }, { entitlement: { key: 'personal_visualization' } }],
    ...overrides,
  }
}

const CATALOG: PlanCatalog[] = [
  plan({}),
  plan({ code: 'DESIGNER_FREE', nameHe: 'מעצב/ת - חינם', price: '0', trialDays: 0, sortOrder: 1, entitlements: [], inclusions: { bullets: ['Unlimited draft designs'] } }),
  plan({
    code: 'JEWELER_ACTIVE',
    role: 'JEWELER',
    nameHe: 'צורף/ת - אקטיבי',
    price: '199',
    leadQuota: 15,
    extraLeadPrice: '25',
    sortOrder: 2,
    entitlements: [{ entitlement: { key: 'warm_leads' } }, { entitlement: { key: 'priority_routing' } }],
  }),
]

describe('pricing plans from the server (PRD 5.8)', () => {
  it("shows the real plan names and prices with agorot, the active role's plans only, in order", () => {
    const cards = planCards(CATALOG, { role: 'DESIGNER', locale: 'he' })
    expect(cards.map((card) => card.code)).toEqual(['DESIGNER_FREE', 'DESIGNER_PRO'])
    expect(cards[1]).toMatchObject({ title: 'מעצב/ת - פרו', price: '₪ 49.90', period: 'לחודש', trial: '14 ימי ניסיון חינם' })
    expect(cards[0]).toMatchObject({ title: 'מעצב/ת - חינם', price: 'חינם', trial: null })
  })

  it('lists what the plan includes from its entitlements, in Hebrew', () => {
    const [, pro] = planCards(CATALOG, { role: 'DESIGNER', locale: 'he' })
    expect(pro.features).toEqual(['ייצוא ללא סימן מים', 'ייצוא תמונת HD', 'הדמיה על תמונה אישית'])
  })

  it('a plan without entitlements shows the bullets the admin wrote', () => {
    const [free] = planCards(CATALOG, { role: 'DESIGNER', locale: 'he' })
    expect(free.features).toEqual(['Unlimited draft designs'])
  })

  it('jeweler plans show their leads and extra lead price', () => {
    const [active] = planCards(CATALOG, { role: 'JEWELER', locale: 'he' })
    expect(active.price).toBe('₪ 199')
    expect(active.features).toEqual(['15 לידים בחודש', '₪ 25 לליד נוסף', 'לידים חמים וממוקדים', 'עדיפות בהפניית בקשות'])
  })

  it('marks the current plan', () => {
    const cards = planCards(CATALOG, { role: 'DESIGNER', locale: 'he', currentPlanCode: 'DESIGNER_PRO' })
    expect(cards.map((card) => card.current)).toEqual([false, true])
  })

  describe('the feature texts the catalog carries in both languages', () => {
    const SEEDED: PlanCatalog[] = [
      plan({
        code: 'DESIGNER_FREE',
        nameHe: 'מעצב/ת - חינם',
        price: '0',
        trialDays: 0,
        sortOrder: 1,
        entitlements: [],
        inclusions: {
          bullets: ['עיצובי טיוטה ללא הגבלה', 'ייצוא רגיל עם סימן מים'],
          bulletsEn: ['Unlimited draft designs', 'Standard export with watermark'],
        },
      }),
      plan({
        inclusions: {
          bullets: ['ייצוא ללא סימן מים', 'ייצוא תמונת HD', 'הדמיה על תמונה אישית'],
          bulletsEn: ['Exports without a watermark', 'HD image export', 'Try-on on your own photo'],
        },
      }),
      plan({
        code: 'JEWELER_BASIC',
        role: 'JEWELER',
        nameHe: 'צורף/ת - בסיסי',
        price: '0',
        leadQuota: 3,
        trialDays: 0,
        sortOrder: 1,
        entitlements: [],
        inclusions: {
          bullets: ['3 לידים בחודש', 'הצגה ברשימת הצורפים באטלייה'],
          bulletsEn: ['3 leads per month', 'Standard profile listing'],
        },
      }),
    ]

    it('the free plan lists its features in Hebrew, not in English', () => {
      const [free] = planCards(SEEDED, { role: 'DESIGNER', locale: 'he' })
      expect(free.features).toEqual(['עיצובי טיוטה ללא הגבלה', 'ייצוא רגיל עם סימן מים'])
    })

    it('in English the English texts are shown', () => {
      const [free, pro] = planCards(SEEDED, { role: 'DESIGNER', locale: 'en' })
      expect(free.features).toEqual(['Unlimited draft designs', 'Standard export with watermark'])
      expect(pro.features).toEqual(['Exports without a watermark', 'HD image export', 'Try-on on your own photo'])
    })

    it('a feature the plan already shows (entitlement, leads) is not listed twice', () => {
      const [, pro] = planCards(SEEDED, { role: 'DESIGNER', locale: 'he' })
      expect(pro.features).toEqual(['ייצוא ללא סימן מים', 'ייצוא תמונת HD', 'הדמיה על תמונה אישית'])
      const [basic] = planCards(SEEDED, { role: 'JEWELER', locale: 'he' })
      expect(basic.features).toEqual(['3 לידים בחודש', 'הצגה ברשימת הצורפים באטלייה'])
    })
  })

  it('names other currencies and billing cycles', () => {
    const [card] = planCards([plan({ currency: 'USD', price: '120', billingCycle: 'ANNUAL', trialDays: 0 })], { role: 'DESIGNER', locale: 'he' })
    expect(card).toMatchObject({ price: '$ 120', period: 'לשנה' })
  })

  describe('the pricing table of 19.10 (quarterly plans, AI creations, fair use)', () => {
    const aiRenders = (limitValue: number | null) => ({ entitlement: { key: 'ai_renders' }, limitValue })

    it('a quarterly plan is priced per quarter, and its AI creations and leads are per quarter', () => {
      const [designer] = planCards(
        [plan({ code: 'DESIGNER_PREMIUM_QUARTERLY', price: '45', billingCycle: 'QUARTERLY', trialDays: 0, entitlements: [aiRenders(150)] })],
        { role: 'DESIGNER', locale: 'he' },
      )
      expect(designer).toMatchObject({ price: '₪ 45', period: 'לרבעון' })
      expect(designer.features[0]).toBe('150 יצירות בבינה מלאכותית ברבעון')

      const [jeweler] = planCards(
        [plan({ code: 'JEWELER_BASIC_QUARTERLY', role: 'JEWELER', price: '390', billingCycle: 'QUARTERLY', leadQuota: 10, entitlements: [] })],
        { role: 'JEWELER', locale: 'en' },
      )
      expect(jeweler).toMatchObject({ period: 'per quarter' })
      expect(jeweler.features[0]).toBe('10 leads per quarter')
    })

    it('the AI creations of a monthly and a yearly plan are named by their period', () => {
      const cards = planCards(
        [
          plan({ code: 'DESIGNER_FREE', price: '0', billingCycle: 'MONTHLY', sortOrder: 1, entitlements: [aiRenders(10)] }),
          plan({ code: 'DESIGNER_PREMIUM_ANNUAL', price: '149', billingCycle: 'ANNUAL', sortOrder: 2, entitlements: [aiRenders(600)] }),
        ],
        { role: 'DESIGNER', locale: 'he' },
      )
      expect(cards[0].features[0]).toBe('10 יצירות בבינה מלאכותית בחודש')
      expect(cards[1].features[0]).toBe('600 יצירות בבינה מלאכותית בשנה')
    })

    it('an unlimited plan says unlimited (fair use), not its fair-use cap', () => {
      const [designer] = planCards(
        [plan({ code: 'DESIGNER_PREMIUM_UNLIMITED', price: '299', billingCycle: 'ANNUAL', metadata: { unlimited: true }, entitlements: [aiRenders(1200)] })],
        { role: 'DESIGNER', locale: 'he' },
      )
      expect(designer.features[0]).toBe('יצירות בבינה מלאכותית ללא הגבלה (שימוש הוגן)')
      expect(designer.features.join(' ')).not.toContain('1200')

      const [jeweler] = planCards(
        [plan({ code: 'JEWELER_UNLIMITED', role: 'JEWELER', price: '990', billingCycle: 'QUARTERLY', leadQuota: 40, metadata: { unlimited: true }, entitlements: [] })],
        { role: 'JEWELER', locale: 'he' },
      )
      expect(jeweler.features[0]).toBe('לידים ללא הגבלה (שימוש הוגן)')
      expect(jeweler.features.join(' ')).not.toContain('40')
    })
  })
})

describe('subscribing', () => {
  const refused = (status: number, code: string) => new ApiError(status, '/subscriptions/subscribe', JSON.stringify({ code, message: 'x' }))

  it('explains a paid plan that needs payment and an existing subscription', () => {
    expect(subscribeErrorMessage(refused(402, 'PAYMENT_REQUIRED'), 'he')).toBe(
      'מסלול זה דורש תשלום, והתשלום בתוך האפליקציה עדיין אינו זמין.',
    )
    expect(subscribeErrorMessage(refused(409, 'SUBSCRIPTION_EXISTS'), 'he')).toBe('כבר יש לך מנוי פעיל. כדי לעבור מסלול יש לבטל קודם את המנוי הנוכחי.')
  })
})

describe('AI creation limits', () => {
  const refused = (code: string) => new ApiError(429, '/ai/inspiration', JSON.stringify({ code, message: 'x' }))

  it('the plan quota and the daily limit are explained in Hebrew, the plan quota with the way to more', () => {
    expect(aiQuotaMessage(refused('AI_PLAN_QUOTA_EXCEEDED'), 'he')).toEqual({
      message: 'ניצלת את כל היצירות בבינה מלאכותית שהמסלול שלך כולל לתקופה הזו.',
      upgrade: true,
    })
    expect(aiQuotaMessage(refused('AI_QUOTA_EXCEEDED'), 'he')).toEqual({
      message: 'הגעת למכסת היצירות היומית. אפשר לנסות שוב מחר.',
      upgrade: false,
    })
    expect(aiQuotaMessage(refused('AI_JOB_IN_PROGRESS'), 'he')).toBeNull()
  })
})
