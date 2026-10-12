import { GOOGLE_WEB_CLIENT_ID } from '@/src/config/env'

export type GoogleSignInProfile = {
  idToken: string
  email?: string
  firstName?: string
  lastName?: string
}

/**
 * Uses @react-native-google-signin/google-signin when the native module is linked.
 * Falls back to a thrown error so the login button can show the unavailable copy.
 */
export async function signInWithGoogleNative(): Promise<GoogleSignInProfile> {
  let GoogleSignin: {
    configure: (opts: { webClientId?: string }) => void
    hasPlayServices: () => Promise<boolean>
    signIn: () => Promise<{
      idToken?: string | null
      data?: { idToken?: string | null; user?: { email?: string; givenName?: string; familyName?: string } }
      user?: { email?: string; givenName?: string; familyName?: string }
    }>
  }
  try {
    GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin
  } catch {
    throw new Error('google-signin-unavailable')
  }

  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
  })
  await GoogleSignin.hasPlayServices()
  const userInfo = await GoogleSignin.signIn()
  const idToken = userInfo.data?.idToken ?? userInfo.idToken
  if (!idToken) {
    throw new Error('google-signin-missing-token')
  }
  const user = userInfo.data?.user ?? userInfo.user
  return {
    idToken,
    email: user?.email,
    firstName: user?.givenName,
    lastName: user?.familyName,
  }
}
