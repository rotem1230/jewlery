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
 */
import { API_BASE_URL } from '@/src/config/env'

export { API_BASE_URL }

const DEFAULT_TIMEOUT_MS = 15_000

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

type RefreshOutcome = 'rotated' | 'rejected' | 'unavailable'

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
    refreshWaiter = (async (): Promise<RefreshOutcome> => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (res.status === 401) return 'rejected'
        if (!res.ok) return 'unavailable'
        const json = (await res.json()) as { data?: { tokens?: AuthTokens } }
        const tokens = json.data?.tokens
        if (!tokens?.accessToken || !tokens?.refreshToken) return 'unavailable'
        authBridge?.applyTokens(tokens)
        return 'rotated'
      } catch {
        return 'unavailable'
      }
    })().finally(() => {
      refreshWaiter = null
    })
  }
  return refreshWaiter
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return sendRequest<T>(path, options, false)
}

async function sendRequest<T>(path: string, options: RequestOptions, didRefresh: boolean): Promise<T> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    anonymous = false,
    skipRefresh = false,
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
      if (outcome === 'rotated') return sendRequest<T>(path, options, true)
      if (outcome === 'rejected') authBridge?.onAuthLost()
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ApiError(res.status, path, text.slice(0, 500))
    }
    const json = (await res.json()) as { success?: boolean; data?: T }
    if (json && typeof json === 'object' && 'data' in json) return json.data as T
    return json as T
  } catch (err) {
    if (err instanceof ApiError) throw err
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

/** Best-effort message from `{ success, message }` JSON or the raw body. */
export function parseApiError(err: unknown): string {
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
