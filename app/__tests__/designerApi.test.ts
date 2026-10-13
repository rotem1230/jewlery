import { listDesignQuotes, listDesigns, updateDesign } from '../src/api/designs'
import { getMyEntitlements } from '../src/api/subscriptions'
import { getFeatureFlags } from '../src/api/visualization'
import { API_BASE_URL, setAuthSessionBridge } from '../src/lib/api'

type Call = { url: string; method: string; body: unknown }

const calls: Call[] = []

function serve(data: unknown) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return { ok: true, status: 200, json: async () => ({ success: true, data }), text: async () => '' } as Response
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

describe('designer backend contract', () => {
  it('lists a page of designs of a tab', async () => {
    serve({ items: [], pagination: { page: 2, pageSize: 20, total: 0, totalPages: 1 }, tabCounts: {} })
    await listDesigns({ status: 'DRAFT', page: 2, sort: 'newest' })
    expect(calls[0].url).toBe(`${API_BASE_URL}/designs?status=DRAFT&page=2&sort=newest`)
  })

  it("lists every quote of a design for its owner", async () => {
    serve([{ id: 'q1' }])
    expect(await listDesignQuotes('d1')).toEqual([{ id: 'q1' }])
    expect(calls[0].url).toBe(`${API_BASE_URL}/designs/d1/quotes`)
  })

  it('saves the preferred region of a design', async () => {
    serve({ id: 'd1' })
    await updateDesign('d1', { version: 4, preferredRegionId: 'r1' })
    expect(calls[0]).toMatchObject({ url: `${API_BASE_URL}/designs/d1`, method: 'PATCH', body: { version: 4, preferredRegionId: 'r1' } })
  })

  it('reads my entitlements and my feature flags', async () => {
    serve({ keys: ['hd_export'] })
    expect(await getMyEntitlements()).toEqual(['hd_export'])
    expect(calls[0].url).toBe(`${API_BASE_URL}/subscriptions/entitlements/me`)

    serve({ phase2_visualization: false })
    expect(await getFeatureFlags()).toEqual({ phase2_visualization: false })
    expect(calls[1].url).toBe(`${API_BASE_URL}/feature-flags`)
  })
})
