import type { PlanCatalog } from '../src/types/api'
import { planCards, subscribeErrorMessage } from '../src/lib/plans'
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

  it('names other currencies and billing cycles', () => {
    const [card] = planCards([plan({ currency: 'USD', price: '120', billingCycle: 'ANNUAL', trialDays: 0 })], { role: 'DESIGNER', locale: 'he' })
    expect(card).toMatchObject({ price: '$ 120', period: 'לשנה' })
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
