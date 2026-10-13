import { getAtelierDesign } from '../src/api/atelier'
import { declineMyOrder, getMyOrders, upsertJewelerDraft } from '../src/api/jewelerProfiles'
import { updateQuote, withdrawQuote } from '../src/api/quotes'
import { API_BASE_URL, ApiError, setAuthSessionBridge } from '../src/lib/api'

type Call = { url: string; method: string; body: unknown; authorization: string | null }

function respond(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response
}

const calls: Call[] = []

function serve(handler: (url: string) => Response) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: new Headers(init?.headers).get('Authorization'),
    })
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

describe('jeweler endpoints', () => {
  it('loads one live listing by id instead of searching the feed', async () => {
    serve(() => respond(200, { success: true, data: { id: 'd1', title: 'Ring' } }))
    const design = await getAtelierDesign('d1')
    expect(design.id).toBe('d1')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${API_BASE_URL}/atelier/designs/d1`)
  })

  it('reports a listing that is no longer live as a 404', async () => {
    serve(() => respond(404, { success: false, message: 'Design not found' }))
    await expect(getAtelierDesign('d1')).rejects.toMatchObject({ status: 404 })
    await expect(getAtelierDesign('d1')).rejects.toBeInstanceOf(ApiError)
  })

  it('asks the server for one tab and one page of the orders board', async () => {
    serve(() => respond(200, { success: true, data: { items: [], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } } }))
    await getMyOrders({ tab: 'negotiating', page: 2 })
    expect(calls[0].url).toBe(`${API_BASE_URL}/jeweler-profiles/me/orders?tab=negotiating&page=2`)
  })

  it('declines a work request', async () => {
    serve(() => respond(201, { success: true, data: { ok: true } }))
    await declineMyOrder('r1')
    expect(calls[0]).toMatchObject({ url: `${API_BASE_URL}/jeweler-profiles/me/orders/r1/decline`, method: 'POST' })
  })

  it('withdraws a pending quote', async () => {
    serve(() => respond(201, { success: true, data: { id: 'q1', status: 'WITHDRAWN' } }))
    await withdrawQuote('q1')
    expect(calls[0]).toMatchObject({ url: `${API_BASE_URL}/quotes/q1/withdraw`, method: 'POST' })
  })

  it('edits the notes of a quote along with its figures', async () => {
    serve(() => respond(200, { success: true, data: { id: 'q1' } }))
    await updateQuote('q1', { materialsCost: 1, laborCost: 2, etaBusinessDays: 7, notes: 'gift box' })
    expect(calls[0]).toMatchObject({ url: `${API_BASE_URL}/quotes/q1`, method: 'PATCH' })
    expect(calls[0].body).toEqual({ materialsCost: 1, laborCost: 2, etaBusinessDays: 7, notes: 'gift box' })
  })

  it('saves business hours and the service area in the profile draft', async () => {
    serve(() => respond(200, { success: true, data: { id: 'draft' } }))
    await upsertJewelerDraft({
      payload: {
        businessName: 'Gold',
        phone: '+972501234567',
        businessHours: [{ day: 0, open: '09:00', close: '18:00' }],
        serviceAreaText: 'Haifa',
      },
      regionId: 'reg',
    })
    expect(calls[0].body).toEqual({
      payload: {
        businessName: 'Gold',
        phone: '+972501234567',
        businessHours: [{ day: 0, open: '09:00', close: '18:00' }],
        serviceAreaText: 'Haifa',
      },
      regionId: 'reg',
    })
  })
})
