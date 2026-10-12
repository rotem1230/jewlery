import { waitForAiJob } from '../src/api/ai'
import { isEmailNotVerified, register, resendVerification } from '../src/api/auth'
import { createJewelryPaymentIntent } from '../src/api/jewelryPayments'
import { acceptQuote } from '../src/api/quotes'
import { API_BASE_URL, ApiError, apiErrorCode, setAuthSessionBridge } from '../src/lib/api'
import { mediaUrl } from '../src/lib/media'

type Call = { url: string; body: unknown }

function respond(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response
}

const calls: Call[] = []

function serve(handler: (url: string) => Response) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return handler(String(input))
  }) as unknown as typeof fetch
}

beforeEach(() => {
  calls.length = 0
  setAuthSessionBridge({
    getAccessToken: () => 'access',
    getRefreshToken: () => 'refresh',
    applyTokens: () => undefined,
    onAuthLost: () => undefined,
  })
})

describe('backend contract', () => {
  it('accepting a quote confirms the exact price and currency shown', async () => {
    serve(() => respond(201, { success: true, data: { id: 'q1', status: 'ACCEPTED' } }))
    await acceptQuote({ id: 'q1', totalPrice: '1500.50', currency: 'ILS' })
    expect(calls[0].url).toBe(`${API_BASE_URL}/quotes/q1/accept`)
    expect(calls[0].body).toEqual({ expectedTotalPrice: 1500.5, expectedCurrency: 'ILS' })
  })

  it('a payment intent names only the accepted quote (the server sets the amount)', async () => {
    serve(() => respond(201, { success: true, data: { id: 'i1' } }))
    await createJewelryPaymentIntent({ quoteId: 'q1' })
    expect(calls[0].body).toEqual({ quoteId: 'q1' })
  })

  it('sign-up returns no session: the e-mail must be verified first', async () => {
    serve(() => respond(201, { success: true, data: { user: { id: 'u1', email: 'a@b.c' }, requiresEmailVerification: true } }))
    const result = await register({ email: 'a@b.c', password: 'Strong-pass1', roles: ['DESIGNER'] })
    expect(result.requiresEmailVerification).toBe(true)
    expect((result as unknown as { tokens?: unknown }).tokens).toBeUndefined()
  })

  it('a verification link can be requested again', async () => {
    serve(() => respond(200, { success: true, data: { ok: true } }))
    await resendVerification('a@b.c')
    expect(calls[0].url).toBe(`${API_BASE_URL}/auth/resend-verify`)
    expect(calls[0].body).toEqual({ email: 'a@b.c' })
  })

  it('recognises the "verify your e-mail" sign-in answer', () => {
    const notVerified = new ApiError(403, '/auth/login', JSON.stringify({ code: 'EMAIL_NOT_VERIFIED' }))
    expect(isEmailNotVerified(notVerified)).toBe(true)
    expect(apiErrorCode(notVerified)).toBe('EMAIL_NOT_VERIFIED')
    expect(isEmailNotVerified(new ApiError(401, '/auth/login', '{}'))).toBe(false)
  })

  it('media links returned by the API are resolved against the API base', () => {
    expect(mediaUrl('/uploads/u1/content?exp=1&sig=abc')).toBe(`${API_BASE_URL}/uploads/u1/content?exp=1&sig=abc`)
    expect(mediaUrl(null)).toBeUndefined()
    expect(mediaUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png')
  })

  it('waits for an AI generation until it finishes, within a generous window', async () => {
    const statuses = ['RUNNING', 'RUNNING', 'SUCCEEDED']
    serve(() => respond(200, { success: true, data: { id: 'j1', status: statuses.shift(), outputUrl: '/uploads/o/content?exp=1&sig=s' } }))
    const sleeps: number[] = []
    const job = await waitForAiJob('j1', { sleep: async (ms) => void sleeps.push(ms) })
    expect(job.status).toBe('SUCCEEDED')
    expect(job.outputUrl).toBe('/uploads/o/content?exp=1&sig=s')
    expect(sleeps.length).toBe(3)
  })

  it('stops waiting for an AI generation after the window', async () => {
    serve(() => respond(200, { success: true, data: { id: 'j1', status: 'RUNNING' } }))
    let clock = 0
    const job = await waitForAiJob('j1', {
      timeoutMs: 10_000,
      intervalMs: 2_000,
      sleep: async (ms) => void (clock += ms),
      now: () => clock,
    })
    expect(job.status).toBe('RUNNING')
    expect(clock).toBeGreaterThanOrEqual(10_000)
  })
})
