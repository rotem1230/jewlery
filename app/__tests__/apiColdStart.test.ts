import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut, setAuthSessionBridge, warmUpBackend } from '../src/lib/api'

type Call = { url: string; init?: RequestInit }

function respond(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response
}

function abortError(): Error {
  const err = new Error('Aborted')
  err.name = 'AbortError'
  return err
}

/** A server that is still waking up: answers after `ms` (or never), unless the request is aborted first. */
function answerAfter(init: RequestInit | undefined, ms: number | null, response: () => Response): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = ms === null ? null : setTimeout(() => resolve(response()), ms)
    init?.signal?.addEventListener('abort', () => {
      if (timer) clearTimeout(timer)
      reject(abortError())
    })
  })
}

const calls: Call[] = []

function serve(handler: (call: Call, index: number) => Response | Promise<Response>) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init }
    calls.push(call)
    return handler(call, calls.length - 1)
  }) as unknown as typeof fetch
}

/** Settles the promise into a value the test can inspect without an unhandled rejection. */
function outcome<T>(promise: Promise<T>): { current: () => { settled: boolean; value?: T; error?: unknown } } {
  let state: { settled: boolean; value?: T; error?: unknown } = { settled: false }
  promise.then(
    (value) => {
      state = { settled: true, value }
    },
    (error: unknown) => {
      state = { settled: true, error }
    },
  )
  return { current: () => state }
}

beforeEach(() => {
  calls.length = 0
  setAuthSessionBridge({
    getAccessToken: () => 'access-1',
    getRefreshToken: () => 'refresh-1',
    applyTokens: jest.fn(),
    onAuthLost: jest.fn(),
  })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('a backend that sleeps when idle (cold start)', () => {
  it('a GET that times out while the server wakes up is tried once more, with a minute to answer', async () => {
    jest.useFakeTimers()
    // The first try gets no answer within 15 s; the retry is answered after 45 s.
    serve(({ init }, index) =>
      index === 0
        ? answerAfter(init, null, () => respond(200, {}))
        : answerAfter(init, 45_000, () => respond(200, { success: true, data: { ok: 1 } })),
    )
    const result = outcome(apiGet('/designs'))
    await jest.advanceTimersByTimeAsync(15_000)
    expect(calls).toHaveLength(2)
    expect(result.current().settled).toBe(false)
    await jest.advanceTimersByTimeAsync(45_000)
    expect(result.current()).toEqual({ settled: true, value: { ok: 1 } })
    expect(calls.map((call) => call.url)).toEqual([calls[0].url, calls[0].url])
  })

  it('the retry gives up after 60 s, and is the only one', async () => {
    jest.useFakeTimers()
    serve(({ init }) => answerAfter(init, null, () => respond(200, {})))
    const result = outcome(apiGet('/designs'))
    await jest.advanceTimersByTimeAsync(15_000 + 59_000)
    expect(result.current().settled).toBe(false)
    await jest.advanceTimersByTimeAsync(1_000)
    expect(result.current().settled).toBe(true)
    expect(result.current().error).toBeInstanceOf(ApiError)
    await jest.advanceTimersByTimeAsync(120_000)
    expect(calls).toHaveLength(2)
  })

  it('a GET that fails on the network is retried once', async () => {
    serve((_call, index) => {
      if (index === 0) throw new TypeError('Network request failed')
      return respond(200, { success: true, data: { ok: 2 } })
    })
    await expect(apiGet('/home/summary')).resolves.toEqual({ ok: 2 })
    expect(calls).toHaveLength(2)
  })

  it('a GET is never retried twice', async () => {
    serve(() => {
      throw new TypeError('Network request failed')
    })
    await expect(apiGet('/home/summary')).rejects.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(2)
  })

  it('POST, PUT, PATCH and DELETE are never retried (they could run twice)', async () => {
    serve(() => {
      throw new TypeError('Network request failed')
    })
    await expect(apiPost('/quotes', { a: 1 })).rejects.toBeInstanceOf(ApiError)
    await expect(apiPut('/jeweler-profiles/draft', { a: 1 })).rejects.toBeInstanceOf(ApiError)
    await expect(apiPatch('/designs/1', { a: 1 })).rejects.toBeInstanceOf(ApiError)
    await expect(apiDelete('/uploads/1')).rejects.toBeInstanceOf(ApiError)
    expect(calls.map((call) => call.init?.method)).toEqual(['POST', 'PUT', 'PATCH', 'DELETE'])
  })

  it('an answer from the server (e.g. 503) is not retried', async () => {
    serve(() => respond(503, { success: false }))
    await expect(apiGet('/designs')).rejects.toMatchObject({ status: 503 })
    expect(calls).toHaveLength(1)
  })

  it('a request the screen cancelled is not retried', async () => {
    serve(({ init }) => answerAfter(init, null, () => respond(200, {})))
    const controller = new AbortController()
    const pending = apiGet('/designs', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(1)
  })
})

describe('warm-up at launch', () => {
  it('pings /health without the session, waits up to a minute, and never fails', async () => {
    jest.useFakeTimers()
    serve(({ init }) => answerAfter(init, null, () => respond(200, {})))
    const done = outcome(warmUpBackend())
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/health$/)
    expect(calls[0].init?.method ?? 'GET').toBe('GET')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined()

    await jest.advanceTimersByTimeAsync(15_000)
    expect(calls[0].init?.signal?.aborted).toBe(false)
    await jest.advanceTimersByTimeAsync(45_000)
    expect(calls[0].init?.signal?.aborted).toBe(true)
    // Fire and forget: no error reaches the caller, and it is not tried again.
    expect(done.current()).toEqual({ settled: true, value: undefined })
    await jest.advanceTimersByTimeAsync(120_000)
    expect(calls).toHaveLength(1)
  })

  it('a server that answers ends the warm-up quietly', async () => {
    serve(() => respond(200, { success: true, data: { status: 'ok' } }))
    await expect(warmUpBackend()).resolves.toBeUndefined()
  })
})
