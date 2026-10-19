import { ApiError } from '../src/lib/api'
import { checkoutErrorMessage, paymentReturn, paymentUnavailableMessage, planAction, waitForCheckout } from '../src/lib/payments'

describe('the Cardcom return page', () => {
  const back = 'https://api.malinovskyjewelry.com/api/v1/payments/cardcom/return?checkout=6f0b5c1e-1111-4222-8333-444455556666'

  it('is recognised with its result, so the payment page closes there', () => {
    expect(paymentReturn(`${back}&result=success`)).toBe('success')
    expect(paymentReturn(`${back}&result=failed&lowprofilecode=abc`)).toBe('failed')
    expect(paymentReturn(`${back}&result=cancel`)).toBe('cancel')
  })

  it('any other page (Cardcom itself, 3-D Secure) is left to load', () => {
    expect(paymentReturn('https://secure.cardcom.solutions/EA/EA5/abc')).toBeNull()
    expect(paymentReturn('https://acs.bank.example/3ds?return=/payments/cardcom/return')).toBeNull()
    expect(paymentReturn('not a url')).toBeNull()
  })

  it('a return page without a known result counts as not paid', () => {
    expect(paymentReturn(back)).toBe('failed')
    expect(paymentReturn(`${back}&result=whatever`)).toBe('failed')
  })
})

describe('waiting for the payment to be confirmed', () => {
  const sleep = () => Promise.resolve()

  it('follows the checkout until the server confirms it', async () => {
    const statuses = ['OPEN', 'OPEN', 'COMPLETED']
    const get = jest.fn(async () => ({ status: statuses.shift() ?? 'COMPLETED' }))
    expect(await waitForCheckout('c1', { get, sleep })).toBe('COMPLETED')
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('a payment kept for review and a withdrawn checkout end the wait', async () => {
    expect(await waitForCheckout('c1', { get: async () => ({ status: 'NEEDS_REVIEW' }), sleep })).toBe('NEEDS_REVIEW')
    expect(await waitForCheckout('c1', { get: async () => ({ status: 'CANCELLED' }), sleep })).toBe('CANCELLED')
  })

  it('stops after its time and says it is still pending (a failed look is tried again)', async () => {
    let now = 0
    const get = jest.fn(async () => {
      now += 1000
      if (now === 2000) throw new Error('network')
      return { status: 'OPEN' }
    })
    const result = await waitForCheckout('c1', { get, sleep, now: () => now }, { timeoutMs: 5000 })
    expect(result).toBe('PENDING')
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(5)
  })
})

describe('what a plan card offers', () => {
  const paid = { code: 'DESIGNER_PREMIUM_QUARTERLY', price: '45' }
  const free = { code: 'DESIGNER_FREE', price: '0' }

  it('without a plan: choose (a trial or the free plan first; payment when it is needed)', () => {
    expect(planAction(paid, null)).toBe('choose')
    expect(planAction(free, null)).toBe('choose')
  })

  it('on a trial or a free plan: pay to move to a paid plan, including the trial’s own', () => {
    const trial = { status: 'TRIALING', plan: { code: 'DESIGNER_PREMIUM_QUARTERLY', price: '45' } }
    expect(planAction(paid, trial)).toBe('pay')
    expect(planAction({ code: 'DESIGNER_PREMIUM_ANNUAL', price: '149' }, trial)).toBe('pay')
    expect(planAction(free, trial)).toBe('none')
    const onFree = { status: 'ACTIVE', plan: { code: 'DESIGNER_FREE', price: '0' } }
    expect(planAction(paid, onFree)).toBe('pay')
    expect(planAction(free, onFree)).toBe('current')
  })

  it('on a paid plan: nothing (cancel first), its own card says current', () => {
    const paying = { status: 'ACTIVE', plan: { code: 'DESIGNER_PREMIUM_QUARTERLY', price: '45' } }
    expect(planAction(paid, paying)).toBe('current')
    expect(planAction({ code: 'DESIGNER_PREMIUM_ANNUAL', price: '149' }, paying)).toBe('none')
  })
})

describe('when a payment cannot start', () => {
  const refused = (status: number, code: string) => new ApiError(status, '/subscriptions/checkout', JSON.stringify({ code, message: 'x' }))

  it('explains it in Hebrew', () => {
    expect(checkoutErrorMessage(refused(503, 'PAYMENT_PROVIDER_UNAVAILABLE'), 'he')).toBe('התשלום אינו זמין כרגע. נסו שוב בעוד רגע.')
    expect(checkoutErrorMessage(refused(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED'), 'he')).toBe('התשלום אינו זמין כרגע. נסו שוב בעוד רגע.')
    // A checkout that came back without a payment page (the provider is not set up).
    expect(paymentUnavailableMessage('he')).toBe('התשלום אינו זמין כרגע. נסו שוב בעוד רגע.')
    expect(checkoutErrorMessage(refused(409, 'SUBSCRIPTION_EXISTS'), 'he')).toBe(
      'כבר יש לך מנוי בתשלום. כדי לעבור מסלול יש לבטל קודם את המנוי הנוכחי.',
    )
  })
})
