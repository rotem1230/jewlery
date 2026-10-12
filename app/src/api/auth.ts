/** Auth endpoints (anonymous — no session token required). */
import { apiGet, apiPatch, apiPost } from '@/src/lib/api'
import type { AuthResult, AuthTokens, SafeUser } from '@/src/types/api'

export function login(email: string, password: string): Promise<AuthResult> {
  return apiPost<AuthResult>('/auth/login', { email, password }, { anonymous: true })
}

export function register(payload: {
  email: string
  password: string
  roles: Array<'DESIGNER' | 'JEWELER'>
  firstName?: string
  lastName?: string
}): Promise<AuthResult> {
  return apiPost<AuthResult>('/auth/register', payload, { anonymous: true })
}

export function forgotPassword(email: string): Promise<{ ok?: boolean }> {
  return apiPost('/auth/forgot-password', { email }, { anonymous: true })
}

export function updateMe(payload: {
  firstName?: string
  lastName?: string
  phone?: string
}): Promise<SafeUser> {
  return apiPatch<SafeUser>('/users/me', payload)
}

export function getMe(signal?: AbortSignal): Promise<SafeUser> {
  return apiGet<SafeUser>('/auth/me', { signal })
}

export function getPublicUser(
  id: string,
  signal?: AbortSignal,
): Promise<{ id: string; firstName: string | null; lastName: string | null; email: string }> {
  return apiGet(`/users/${id}`, { signal })
}

export function logout(refreshToken: string): Promise<{ ok?: boolean }> {
  return apiPost('/auth/logout', { refreshToken }, { anonymous: true, skipRefresh: true })
}

export function refreshSession(refreshToken: string): Promise<{ tokens: AuthTokens }> {
  return apiPost('/auth/refresh', { refreshToken }, { anonymous: true, skipRefresh: true })
}

export function switchRole(role: 'DESIGNER' | 'JEWELER'): Promise<AuthResult> {
  return apiPost<AuthResult>('/auth/switch-role', { role })
}

export function oauthGoogle(payload: {
  idToken: string
  email?: string
  firstName?: string
  lastName?: string
}): Promise<AuthResult> {
  return apiPost<AuthResult>('/auth/oauth/google', payload, { anonymous: true })
}

export function changePassword(payload: {
  currentPassword: string
  newPassword: string
}): Promise<{ ok?: boolean }> {
  return apiPatch('/users/me/password', payload)
}
