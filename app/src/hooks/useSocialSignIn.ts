import { useCallback } from 'react'
import { Alert } from 'react-native'
import { oauthApple, oauthGoogle, type SignUpConsent } from '@/src/api/auth'
import { useTranslation } from '@/src/i18n'
import type { MarketplaceRole } from '@/src/lib/accountRoles'
import { apiErrorCode, parseApiError } from '@/src/lib/api'
import { signInWithGoogleNative } from '@/src/lib/googleSignIn'
import { sessionFromAuth } from '@/src/lib/session'
import { isAppleSignInCancelled, roleSetupAfterSocialSignUp, signInWithAppleNative } from '@/src/lib/socialSignIn'
import { addAccountRole, switchAccountRole } from '@/src/store/authActions'
import { useAppDispatch } from '@/src/store/hooks'
import { setSession } from '@/src/store/store'
import type { AuthResult } from '@/src/types/api'

type Options = {
  /** Remember the session on this device (the sign-in screen's "remember me"). */
  persist: boolean
  /** Sign-up only: the role chosen on the screen (new Apple/Google accounts start as designers). */
  signUpRole?: MarketplaceRole
  /** Sign-up only: the terms accepted and the marketing choice, recorded with a new account. */
  consent?: SignUpConsent
  /** Sign-in only: a new account needs the terms accepted first (the server answered TERMS_REQUIRED). */
  onTermsRequired?: () => void
  setBusy: (busy: boolean) => void
}

/** Sign in (or up) with Apple or Google, then store the session like an e-mail sign-in. */
export function useSocialSignIn({ persist, signUpRole, consent, onTermsRequired, setBusy }: Options) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()

  const complete = useCallback(
    async (result: AuthResult) => {
      dispatch(setSession({ ...sessionFromAuth(result), persist }))
      if (!signUpRole) return
      const plan = roleSetupAfterSocialSignUp(signUpRole, result.user)
      if (plan.add) await dispatch(addAccountRole(plan.add))
      if (plan.switchTo) await dispatch(switchAccountRole(plan.switchTo))
    },
    [dispatch, persist, signUpRole],
  )

  /** A new account from the sign-in screen goes to sign-up (where the terms are accepted), not to an error. */
  const refused = useCallback(
    (err: unknown, unavailable: () => string | null) => {
      if (apiErrorCode(err) === 'TERMS_REQUIRED' && onTermsRequired) {
        onTermsRequired()
        return
      }
      Alert.alert(t('authErrorTitle'), unavailable() ?? parseApiError(err))
    },
    [onTermsRequired, t],
  )

  const withApple = useCallback(async () => {
    setBusy(true)
    try {
      const profile = await signInWithAppleNative()
      await complete(await oauthApple({ ...profile, ...consent }))
    } catch (err) {
      // Closing Apple's sheet is the user's choice, not an error.
      if (isAppleSignInCancelled(err)) return
      refused(err, () => (err instanceof Error && err.message.startsWith('apple-signin') ? t('shAuthAppleUnavailable') : null))
    } finally {
      setBusy(false)
    }
  }, [complete, consent, refused, setBusy, t])

  const withGoogle = useCallback(async () => {
    setBusy(true)
    try {
      const profile = await signInWithGoogleNative()
      await complete(
        await oauthGoogle({ idToken: profile.idToken, firstName: profile.firstName, lastName: profile.lastName, ...consent }),
      )
    } catch (err) {
      refused(err, () => (err instanceof Error && err.message.startsWith('google-signin') ? t('authGoogleUnavailable') : null))
    } finally {
      setBusy(false)
    }
  }, [complete, consent, refused, setBusy, t])

  return { withApple, withGoogle }
}
