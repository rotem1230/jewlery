/**
 * Shared HTTP transport for the backend.
 *
 * - The API URL is build-time configuration (src/config/env.ts): the local backend in
 *   development, a required https URL in release builds.
 * - Backend wraps payloads in `{ success, data }` (see TransformInterceptor).
 * - Auth header is injected from the Redux session via `setAuthSessionBridge`
 *   so domain modules (`src/api/*`) stay token-free (DRY).
 * - 401 responses rotate `POST /auth/refresh` once, then retry. Only a refresh the server
 *   rejects (401) signs the user out; an outage or timeout keeps the session for a later retry.
 * - The hosted API sleeps when idle and its first answer can take up to a minute: a GET that
 *   times out or fails on the network is tried once more with a minute to answer. Other methods
 *   are never repeated (the first try may have reached the server).
 */
import { API_BASE_URL } from '@/src/config/env'
import { t, type TranslationKey } from '@/src/i18n'

export { API_BASE_URL }

const DEFAULT_TIMEOUT_MS = 15_000
/** How long a server waking up from idle may take to answer. */
const COLD_START_TIMEOUT_MS = 60_000

export class ApiError extends Error {
  status: number
  path: string
  body: string

  constructor(status: number, path: string, body: string) {
    super(`API ${status} ${path}`)
    this.name = 'ApiError'
    this.status = status
    this.path = path
    this.body = body
  }
}

type TokenProvider = () => string | null

type AuthTokens = { accessToken: string; refreshToken: string }

type AuthSessionBridge = {
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  applyTokens: (tokens: AuthTokens) => void
  onAuthLost: () => void
}

/**
 * `superseded`: the session changed while its refresh was on the way (signed out, or signed in
 * again); the answer belongs to the old session and is not applied to the new one.
 */
type RefreshOutcome = 'rotated' | 'rejected' | 'unavailable' | 'superseded'

let authBridge: AuthSessionBridge | null = null
let refreshWaiter: Promise<RefreshOutcome> | null = null

/** Called once from the store bootstrap so requests carry the session JWT. */
export function setAuthTokenProvider(provider: TokenProvider | null) {
  if (!provider) {
    authBridge = null
    return
  }
  authBridge = {
    ...authBridge,
    getAccessToken: provider,
    getRefreshToken: authBridge?.getRefreshToken ?? (() => null),
    applyTokens: authBridge?.applyTokens ?? (() => undefined),
    onAuthLost: authBridge?.onAuthLost ?? (() => undefined),
  }
}

/** Access + refresh token wiring. Replaces a lone `setAuthTokenProvider` call. */
export function setAuthSessionBridge(bridge: AuthSessionBridge | null) {
  authBridge = bridge
}

export type RequestOptions = RequestInit & {
  /** Abort a hung request (default 15s). Pass `timeoutMs: 0` to disable. */
  timeoutMs?: number
  /** Skip the Authorization header (e.g. login / public endpoints). */
  anonymous?: boolean
  /** Do not attempt refresh-token rotation on 401 (used by `/auth/refresh` itself). */
  skipRefresh?: boolean
  /** A GET that times out or fails on the network is not tried again. */
  noRetry?: boolean
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null
  const onOuterAbort = () => controller.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })
  return {
    signal: controller.signal,
    done: () => {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    },
  }
}

async function rotateAccessToken(): Promise<RefreshOutcome> {
  const refreshToken = authBridge?.getRefreshToken() ?? null
  if (!refreshToken || refreshToken === 'demo') return 'unavailable'
  if (!refreshWaiter) {
    const managed = withTimeout(undefined, DEFAULT_TIMEOUT_MS)
    let giveUp!: () => void
    // Every request that got a 401 waits on this one refresh: it must end even when the
    // connection hangs without honouring the abort (React Native has no default fetch timeout).
    const timedOut = new Promise<RefreshOutcome>((resolve) => {
      giveUp = () => resolve('unavailable')
      managed.signal.addEventListener('abort', giveUp, { once: true })
    })
    const refreshed = (async (): Promise<RefreshOutcome> => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: managed.signal,
        })
        if (authBridge?.getRefreshToken() !== refreshToken) return 'superseded'
        if (res.status === 401) return 'rejected'
        if (!res.ok) return 'unavailable'
        const json = (await res.json()) as { data?: { tokens?: AuthTokens } }
        const tokens = json.data?.tokens
        if (!tokens?.accessToken || !tokens?.refreshToken) return 'unavailable'
        if (authBridge?.getRefreshToken() !== refreshToken) return 'superseded'
        authBridge?.applyTokens(tokens)
        return 'rotated'
      } catch {
        return 'unavailable'
      }
    })()
    refreshWaiter = Promise.race([refreshed, timedOut]).finally(() => {
      managed.signal.removeEventListener('abort', giveUp)
      managed.done()
      refreshWaiter = null
    })
  }
  return refreshWaiter
}

type ReadBody<T> = (res: Response) => Promise<T>

/** `{ success, data }` envelope → data (plain JSON is returned as is). */
async function readJson<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { success?: boolean; data?: T }
  if (json && typeof json === 'object' && 'data' in json) return json.data as T
  return json as T
}

/** A binary answer (a picture) as a `data:` URI an <Image> can show without a request of its own. */
async function readDataUri(res: Response): Promise<string> {
  const blob = await res.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unreadable picture'))
    reader.onerror = () => reject(new Error('Unreadable picture'))
    reader.readAsDataURL(blob)
  })
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return sendRequest<T>(path, options, false, false, readJson)
}

/**
 * GET of a private picture with the session (bearer token, refresh on 401) as a `data:` URI.
 * For pictures served only to a signed-in caller: an <Image> on Android does not send
 * `source.headers`.
 */
export async function apiGetDataUri(path: string, options: RequestOptions = {}): Promise<string> {
  return sendRequest<string>(path, options, false, false, readDataUri)
}

/**
 * The request never got an answer: it timed out (not cancelled by the caller) or the network
 * failed. A JSON parse error or an HTTP status is an answer and does not count.
 */
function isTransportFailure(err: unknown, callerSignal: AbortSignal | null | undefined): boolean {
  if (!(err instanceof Error) || err instanceof ApiError) return false
  if (err.name === 'AbortError') return !callerSignal?.aborted
  return err instanceof TypeError
}

async function sendRequest<T>(
  path: string,
  options: RequestOptions,
  didRefresh: boolean,
  isRetry: boolean,
  readBody: ReadBody<T>,
): Promise<T> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    anonymous = false,
    skipRefresh = false,
    noRetry = false,
    headers,
    signal,
    ...init
  } = options
  const managed = withTimeout(signal ?? undefined, timeoutMs)
  try {
    const token = anonymous ? null : authBridge?.getAccessToken() ?? null
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: managed.signal,
      headers: {
        // fetch sets its own multipart boundary for FormData.
        ...(isFormData ? null : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : null),
        ...headers,
      },
    })
    if (
      res.status === 401 &&
      !anonymous &&
      !skipRefresh &&
      !didRefresh &&
      path !== '/auth/refresh'
    ) {
      const outcome = await rotateAccessToken()
      // Superseded: retried once with whatever session is current now.
      if (outcome === 'rotated' || outcome === 'superseded') {
        return sendRequest<T>(path, options, true, isRetry, readBody)
      }
      if (outcome === 'rejected') authBridge?.onAuthLost()
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ApiError(res.status, path, text.slice(0, 500))
    }
    return await readBody(res)
  } catch (err) {
    if (err instanceof ApiError) throw err
    const method = (init.method ?? 'GET').toUpperCase()
    if (method === 'GET' && !noRetry && !isRetry && isTransportFailure(err, signal)) {
      // The server may still be waking up: once more, with the time a cold start takes.
      const retryTimeoutMs = timeoutMs > 0 ? Math.max(timeoutMs, COLD_START_TIMEOUT_MS) : 0
      return sendRequest<T>(path, { ...options, timeoutMs: retryTimeoutMs }, didRefresh, true, readBody)
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, path, 'Request timed out or was aborted')
    }
    throw new ApiError(0, path, err instanceof Error ? err.message : 'Network request failed')
  } finally {
    managed.done()
  }
}

export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>(path, options)
}

export function apiPost<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>(path, { ...options, method: 'POST', body: JSON.stringify(body ?? {}) })
}

export function apiPut<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body ?? {}) })
}

export function apiPatch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body ?? {}) })
}

export function apiDelete<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>(path, { ...options, method: 'DELETE' })
}

/** 403 `{ code: 'PAYWALL' }` from entitlements.assert. */
export function isPaywallError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false
  try {
    const json = JSON.parse(err.body) as { code?: string }
    return json.code === 'PAYWALL'
  } catch {
    return false
  }
}

/** Machine-readable `code` of an API error body (e.g. EMAIL_NOT_VERIFIED), if any. */
export function apiErrorCode(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined
  try {
    const json = JSON.parse(err.body) as { code?: unknown }
    return typeof json.code === 'string' ? json.code : undefined
  } catch {
    return undefined
  }
}

/** Codes whose English server message is replaced by an explanation in the user's language. */
const ERROR_CODE_MESSAGES = new Map<string, TranslationKey>([
  ['DESIGN_EXPIRED', 'shErrDesignExpired'],
  ['DESIGN_CHANGED_SINCE_QUOTE', 'shErrDesignChangedSinceQuote'],
  ['QUOTE_EXPIRED', 'shErrQuoteExpired'],
  ['QUOTE_NOT_PENDING', 'shErrQuoteNotPending'],
  ['QUOTE_PENDING', 'shErrQuotePending'],
  ['ORDER_COMPLETED', 'shErrOrderCompleted'],
  ['PAYWALL', 'shErrPaywall'],
  ['FEATURE_DISABLED', 'shErrFeatureDisabled'],
  ['DESIGN_COMPLETED', 'shErrDesignCompleted'],
  ['DESIGN_NOT_PUBLISHED', 'shErrDesignNotPublished'],
  ['REQUEST_NOT_OPEN', 'shErrRequestNotOpen'],
])

/** The localized explanation of a known error `code`, or undefined (callers pick their fallback). */
export function knownApiErrorMessage(err: unknown): string | undefined {
  const code = apiErrorCode(err)
  const key = code ? ERROR_CODE_MESSAGES.get(code) : undefined
  return key ? t(key) : undefined
}

/** A known error code's explanation, else best-effort message from `{ success, message }` JSON or the raw body. */
export function parseApiError(err: unknown): string {
  const known = knownApiErrorMessage(err)
  if (known) return known
  if (err instanceof ApiError) {
    try {
      const json = JSON.parse(err.body) as {
        message?: string | string[]
        errors?: Array<string | { field?: string; message?: string }>
      }
      const firstError = Array.isArray(json.errors) ? json.errors[0] : undefined
      if (typeof firstError === 'string' && firstError) return firstError
      if (firstError && typeof firstError === 'object' && firstError.message) return firstError.message
      if (typeof json.message === 'string' && json.message.trim()) return json.message
      if (Array.isArray(json.message) && json.message[0]) return String(json.message[0])
    } catch {
      /* body is not JSON */
    }
    if (err.body.trim()) return err.body
  }
  if (err instanceof Error && err.message) return err.message
  return 'Request failed'
}

export function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

/** Liveness probe used by the dev status banner. */
export function getHealth(signal?: AbortSignal): Promise<{ status: string }> {
  return request<{ status: string }>('/health', { signal, anonymous: true })
}

/**
 * Fired once at launch: wakes a backend that went to sleep while idle, so the first screen's
 * requests do not wait out its cold start. Fire and forget: it never fails and shows nothing.
 */
export async function warmUpBackend(): Promise<void> {
  try {
    await request<unknown>('/health', { anonymous: true, timeoutMs: COLD_START_TIMEOUT_MS, noRetry: true })
  } catch {
    // Nothing to tell the user: the screens' own requests report a real outage.
  }
}
