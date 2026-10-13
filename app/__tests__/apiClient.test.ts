import { ApiError, apiGet, parseApiError, setAuthSessionBridge } from '../src/lib/api'

type Call = { url: string; init?: RequestInit }

function respond(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response
}

describe('API client session handling', () => {
  const calls: Call[] = []
  let onAuthLost: jest.Mock
  let applyTokens: jest.Mock

  beforeEach(() => {
    calls.length = 0
    onAuthLost = jest.fn()
    applyTokens = jest.fn()
    setAuthSessionBridge({
      getAccessToken: () => 'expired-access',
      getRefreshToken: () => 'refresh-1',
      applyTokens,
      onAuthLost,
    })
  })

  function serve(handler: (url: string) => Response | Promise<Response>) {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return handler(String(input))
    }) as unknown as typeof fetch
  }

  it('retries once with the rotated token', async () => {
    let first = true
    serve((url) => {
      if (url.endsWith('/auth/refresh')) {
        return respond(201, { success: true, data: { tokens: { accessToken: 'new-access', refreshToken: 'refresh-2' } } })
      }
      if (first) {
        first = false
        return respond(401, { success: false })
      }
      return respond(200, { success: true, data: { ok: 1 } })
    })
    await expect(apiGet('/designs')).resolves.toEqual({ ok: 1 })
    expect(applyTokens).toHaveBeenCalledWith({ accessToken: 'new-access', refreshToken: 'refresh-2' })
    expect(onAuthLost).not.toHaveBeenCalled()
  })

  it('signs out when the refresh token itself is rejected (401)', async () => {
    serve((url) => (url.endsWith('/auth/refresh') ? respond(401, { success: false }) : respond(401, { success: false })))
    await expect(apiGet('/designs')).rejects.toBeInstanceOf(ApiError)
    expect(onAuthLost).toHaveBeenCalledTimes(1)
  })

  it('keeps the session when the refresh fails for another reason (outage, timeout)', async () => {
    serve((url) => (url.endsWith('/auth/refresh') ? respond(503, { success: false }) : respond(401, { success: false })))
    await expect(apiGet('/designs')).rejects.toBeInstanceOf(ApiError)
    expect(onAuthLost).not.toHaveBeenCalled()

    serve((url) => {
      if (url.endsWith('/auth/refresh')) {
        throw new TypeError('Network request failed')
      }
      return respond(401, { success: false })
    })
    await expect(apiGet('/designs')).rejects.toBeInstanceOf(ApiError)
    expect(onAuthLost).not.toHaveBeenCalled()
  })

  it('gives up on a refresh that never answers, keeps the session and lets later requests refresh again', async () => {
    jest.useFakeTimers()
    try {
      // A half-open connection: the refresh call neither answers nor fails, and ignores aborts.
      serve((url) => (url.endsWith('/auth/refresh') ? new Promise<Response>(() => undefined) : respond(401, { success: false })))
      const first = apiGet('/designs').then(
        () => 'resolved',
        (err: unknown) => err,
      )
      await jest.advanceTimersByTimeAsync(20_000)
      expect(await first).toBeInstanceOf(ApiError)
      expect(onAuthLost).not.toHaveBeenCalled()

      let refreshed = false
      serve((url) => {
        if (url.endsWith('/auth/refresh')) {
          refreshed = true
          return respond(201, { success: true, data: { tokens: { accessToken: 'new-access', refreshToken: 'refresh-2' } } })
        }
        return refreshed ? respond(200, { success: true, data: { ok: 1 } }) : respond(401, { success: false })
      })
      await expect(apiGet('/designs')).resolves.toEqual({ ok: 1 })
      expect(applyTokens).toHaveBeenCalledWith({ accessToken: 'new-access', refreshToken: 'refresh-2' })
    } finally {
      jest.useRealTimers()
    }
  })

  it('a refresh answer for a session that was replaced meanwhile does not touch the new session', async () => {
    let current = 'refresh-1'
    setAuthSessionBridge({
      getAccessToken: () => 'expired-access',
      getRefreshToken: () => current,
      applyTokens,
      onAuthLost,
    })
    // The user signs in again while the old session's refresh is on its way, and is refused.
    serve((url) => {
      if (url.endsWith('/auth/refresh')) {
        current = 'refresh-of-new-login'
        return respond(401, { success: false })
      }
      return respond(401, { success: false })
    })
    await expect(apiGet('/designs')).rejects.toBeInstanceOf(ApiError)
    expect(onAuthLost).not.toHaveBeenCalled()

    current = 'refresh-1'
    serve((url) => {
      if (url.endsWith('/auth/refresh')) {
        current = 'refresh-of-new-login'
        return respond(201, { success: true, data: { tokens: { accessToken: 'old-access', refreshToken: 'old-refresh' } } })
      }
      return respond(401, { success: false })
    })
    await expect(apiGet('/designs')).rejects.toBeInstanceOf(ApiError)
    expect(applyTokens).not.toHaveBeenCalled()
  })
})

describe('API error messages', () => {
  it('reads the first field error of a validation failure', () => {
    const err = new ApiError(
      400,
      '/x',
      JSON.stringify({ success: false, message: 'Validation failed', errors: [{ field: 'title', message: 'title is too long' }] }),
    )
    expect(parseApiError(err)).toBe('title is too long')
  })

  it('reads the message of a regular error', () => {
    expect(parseApiError(new ApiError(409, '/x', JSON.stringify({ message: 'Quote changed', code: 'QUOTE_CHANGED' })))).toBe(
      'Quote changed',
    )
  })
})
