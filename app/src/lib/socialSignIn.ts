/**
 * Sign in with Apple (iOS only) and the rules shared by the Apple and Google buttons.
 * The native module is required lazily, so screens and tests load without it.
 */
import { Platform } from 'react-native'

export type SocialProfile = { idToken: string; firstName?: string; lastName?: string }

type AppleCredential = {
  identityToken?: string | null
  fullName?: { givenName?: string | null; familyName?: string | null } | null
}

type AppleModule = {
  appleAuth: {
    isSupported: boolean
    performRequest: (request: { requestedOperation: number; requestedScopes: number[] }) => Promise<AppleCredential>
    Operation: { LOGIN: number }
    Scope: { EMAIL: number; FULL_NAME: number }
  }
}

/** Apple sign-in is offered on Apple devices that support it, never on Android. */
export function appleSignInAvailable(os: string, supported: boolean): boolean {
  return os === 'ios' && supported
}

/** Apple shares the user's name only on the first sign-in; later ones carry the token alone. */
export function profileFromAppleCredential(credential: AppleCredential): SocialProfile {
  if (!credential.identityToken) {
    throw new Error('apple-signin-missing-token')
  }
  const profile: SocialProfile = { idToken: credential.identityToken }
  const firstName = credential.fullName?.givenName?.trim()
  const lastName = credential.fullName?.familyName?.trim()
  if (firstName) profile.firstName = firstName
  if (lastName) profile.lastName = lastName
  return profile
}

/** The user closed Apple's sheet (ASAuthorizationError.canceled). */
export function isAppleSignInCancelled(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && String((err as { code: unknown }).code) === '1001'
}

function appleModule(): AppleModule | null {
  try {
    return require('@invertase/react-native-apple-authentication') as AppleModule
  } catch {
    return null
  }
}

export function isAppleSignInSupported(): boolean {
  return appleSignInAvailable(Platform.OS, Boolean(appleModule()?.appleAuth?.isSupported))
}

export async function signInWithAppleNative(): Promise<SocialProfile> {
  const module = appleModule()
  if (!module) {
    throw new Error('apple-signin-unavailable')
  }
  const { appleAuth } = module
  // FULL_NAME first: Apple otherwise sometimes omits the name on the first sign-in.
  const credential = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
  })
  return profileFromAppleCredential(credential)
}

type MarketplaceRole = 'DESIGNER' | 'JEWELER'

/**
 * The server creates an account that signs up with Apple or Google as a designer. Someone who chose
 * "jeweler" on the sign-up screen gets that role added and made active.
 */
export function roleSetupAfterSocialSignUp(
  chosen: MarketplaceRole,
  user: { roles: string[]; activeRole: string },
): { add: MarketplaceRole | null; switchTo: MarketplaceRole | null } {
  return {
    add: user.roles.includes(chosen) ? null : chosen,
    switchTo: user.activeRole === chosen ? null : chosen,
  }
}

/** The Google button is shown only when the build carries a Google client id (otherwise it can only fail). */
export function googleSignInConfigured(webClientId: string | undefined): boolean {
  return Boolean(webClientId && webClientId.trim())
}
