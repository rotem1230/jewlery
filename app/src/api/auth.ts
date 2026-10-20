/** Auth endpoints (anonymous — no session token required). */
import { apiErrorCode, apiGet, apiPatch, apiPost } from '@/src/lib/api'
import type { AuthResult, AuthTokens, SafeUser } from '@/src/types/api'

/** Sign-up creates an account that must verify its e-mail before it can sign in. */
export type RegisterResult = { user: SafeUser; requiresEmailVerification: true }

export function login(email: string, password: string): Promise<AuthResult> {
  return apiPost<AuthResult>('/auth/login', { email, password }, { anonymous: true })
}

/**
 * What the sign-up screen records with a new account: the terms box (required), the version of the
 * terms the links open, and the separate marketing box (off unless ticked).
 */
export type SignUpConsent = { acceptTerms?: boolean; termsVersion?: number; marketingConsent?: boolean }

export function register(payload: {
  email: string
  password: string
  roles: Array<'DESIGNER' | 'JEWELER'>
  firstName?: string
  lastName?: string
  /** E.164; stored with the account (there is no session to send it later). */
  phone?: string
} & SignUpConsent): Promise<RegisterResult> {
  return apiPost<RegisterResult>('/auth/register', payload, { anonymous: true })
}

/** Mails a fresh verification link (always answers OK, whether or not the account exists). */
export function resendVerification(email: string): Promise<{ ok?: boolean }> {
  return apiPost('/auth/resend-verify', { email }, { anonymous: true })
}

/** Sign-in refused because the e-mail address has not been verified yet. */
export function isEmailNotVerified(err: unknown): boolean {
  return apiErrorCode(err) === 'EMAIL_NOT_VERIFIED'
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

/** Adds a role to the account (idempotent); the active role does not change — see `switchRole`. */
export function addRole(role: 'DESIGNER' | 'JEWELER'): Promise<AuthResult> {
  return apiPost<AuthResult>('/auth/roles', { role })
}

/** The server reads the identity (and a verified e-mail) from the ID token only. */
export function oauthGoogle(payload: {
  idToken: string
  firstName?: string
  lastName?: string
} & SignUpConsent): Promise<AuthResult> {
  return apiPost<AuthResult>('/auth/oauth/google', payload, { anonymous: true })
}

/** POST /auth/oauth/apple — Sign in with Apple (iOS). The name is sent only on the first sign-in. */
export function oauthApple(payload: {
  idToken: string
  firstName?: string
  lastName?: string
} & SignUpConsent): Promise<AuthResult> {
  return apiPost<AuthResult>('/auth/oauth/apple', payload, { anonymous: true })
}

export function changePassword(payload: {
  currentPassword: string
  newPassword: string
}): Promise<{ ok?: boolean }> {
  return apiPatch('/users/me/password', payload)
}
