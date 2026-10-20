import { useMemo, useState } from 'react'
import { Alert, Pressable, Text, View, StyleSheet } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AuthScreenLayout } from '@/src/components/auth/AuthScreenLayout'
import { AppleAuthButton } from '@/src/components/auth/AppleAuthButton'
import { GoogleAuthButton } from '@/src/components/auth/GoogleAuthButton'
import { PhoneField } from '@/src/components/auth/PhoneField'
import { Button, Checkbox, Field } from '@/src/components/ui'
import { register, resendVerification, type SignUpConsent } from '@/src/api/auth'
import { getContentPage } from '@/src/api/subscriptions'
import { GOOGLE_WEB_CLIENT_ID } from '@/src/config/env'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useSocialSignIn } from '@/src/hooks/useSocialSignIn'
import { parseApiError } from '@/src/lib/api'
import { splitFullName } from '@/src/lib/format'
import { ltrIsolate } from '@/src/lib/rtl'
import { googleSignInConfigured } from '@/src/lib/socialSignIn'
import { isValidEmail, passwordIssue, toE164Phone } from '@/src/lib/validation'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'
import type { AuthStackParamList } from '@/src/navigation/types'

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>

type FieldErrors = {
  email?: string
  password?: string
  fullName?: string
  phone?: string
}

export function SignupScreen({ navigation, route }: Props) {
  const { t } = useTranslation()
  const role = route.params?.role ?? 'DESIGNER'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [accepted, setAccepted] = useState(false)
  // Marketing messages are a separate choice (the anti-spam law): off unless ticked.
  const [marketing, setMarketing] = useState(false)
  // The version of the terms the links open, recorded with the acceptance (Hebrew: the binding text).
  const termsPage = useAsyncData((signal) => getContentPage('tos', 'he', signal))
  const termsVersion = termsPage.data?.version
  const consent = useMemo<SignUpConsent | undefined>(
    () => (accepted ? { acceptTerms: true, termsVersion, marketingConsent: marketing } : undefined),
    [accepted, marketing, termsVersion],
  )
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})

  const onSignup = async () => {
    const trimmed = email.trim()
    const next: FieldErrors = {}
    if (!trimmed) next.email = t('validationRequired')
    else if (!isValidEmail(trimmed)) next.email = t('validationEmail')
    const pwd = passwordIssue(password)
    if (pwd === 'empty') next.password = t('validationRequired')
    else if (pwd) next.password = t('authPasswordTooShort')
    if (!fullName.trim()) next.fullName = t('validationRequired')
    const e164 = phone.trim() ? toE164Phone(phone) : null
    if (phone.trim() && !e164) next.phone = t('validationPhone')
    setErrors(next)
    if (Object.keys(next).length > 0) return
    if (!accepted) {
      Alert.alert(t('authErrorTitle'), t('authNeedTerms'))
      return
    }

    setBusy(true)
    try {
      const { firstName, lastName } = splitFullName(fullName)
      await register({
        email: trimmed,
        password,
        roles: [role],
        firstName: firstName || undefined,
        lastName,
        phone: e164 ?? undefined,
        acceptTerms: true,
        termsVersion,
        marketingConsent: marketing,
      })
      // No session yet: the account works once the e-mailed link has been opened. The address is
      // one left-to-right run inside the Hebrew sentence (not split around its dots).
      Alert.alert(t('authVerifyEmailTitle'), t('authVerifyEmailBody').replace('{{email}}', ltrIsolate(trimmed)), [
        {
          text: t('authResendVerification'),
          onPress: () => {
            resendVerification(trimmed)
              .then(() => Alert.alert(t('authVerifyEmailTitle'), t('authVerificationResent')))
              .catch((err) => Alert.alert(t('authErrorTitle'), parseApiError(err)))
          },
        },
        { text: t('login'), onPress: () => navigation.navigate('Login', { role }) },
      ])
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const social = useSocialSignIn({ persist: true, signUpRole: role, consent, setBusy })

  /** Apple / Google create the account too: the terms must be accepted first, as for e-mail. */
  const afterTerms = (go: () => Promise<void>) => () => {
    if (!accepted) {
      Alert.alert(t('authErrorTitle'), t('authNeedTerms'))
      return
    }
    // The handler reports its own errors; nothing is left to await here.
    go().catch(() => undefined)
  }

  return (
    <AuthScreenLayout
      top={
        <View style={styles.top}>
          <Text style={styles.title}>{t('signupSubtitle')}</Text>
          <View style={styles.fields}>
            <Field
              label={t('email')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              value={email}
              error={errors.email}
              onChangeText={(value) => {
                setEmail(value)
                setErrors((prev) => ({ ...prev, email: undefined }))
              }}
            />
            <Field
              label={t('password')}
              secureTextEntry
              value={password}
              error={errors.password}
              onChangeText={(value) => {
                setPassword(value)
                setErrors((prev) => ({ ...prev, password: undefined }))
              }}
            />
            <Field
              label={t('fullName')}
              value={fullName}
              error={errors.fullName}
              onChangeText={(value) => {
                setFullName(value)
                setErrors((prev) => ({ ...prev, fullName: undefined }))
              }}
            />
            <PhoneField
              label={t('phone')}
              value={phone}
              error={errors.phone}
              onChangeText={(value) => {
                setPhone(value)
                setErrors((prev) => ({ ...prev, phone: undefined }))
              }}
            />
          </View>
          <Checkbox
            testID="terms"
            checked={accepted}
            onChange={setAccepted}
            labelNode={
              <Text style={styles.terms}>
                {t('termsAcceptBefore')}
                <Text style={styles.termsLink} onPress={() => navigation.navigate('Terms')}>
                  {t('termsOfUseLink')}
                </Text>
                {t('termsAcceptBetween')}
                <Text style={styles.termsLink} onPress={() => navigation.navigate('Terms', { section: 'privacy' })}>
                  {t('privacyPolicyLink')}
                </Text>
                {t('termsAcceptAfter')}
              </Text>
            }
          />
          <Checkbox testID="marketing" checked={marketing} onChange={setMarketing} label={t('marketingConsentLabel')} />
        </View>
      }
      bottom={
        <>
          <Button fullWidth disabled={!accepted || busy} onPress={() => void onSignup()}>
            {t('signup')}
          </Button>
          <AppleAuthButton onPress={afterTerms(social.withApple)} />
          {googleSignInConfigured(GOOGLE_WEB_CLIENT_ID) ? (
            <GoogleAuthButton onPress={afterTerms(social.withGoogle)} />
          ) : null}
          <Pressable
            onPress={() => navigation.navigate('Login', { role })}
            style={styles.linkBtn}
          >
            <Text style={styles.linkBody}>
              {t('alreadyHaveAccount')}{' '}
              <Text style={styles.linkEmphasis}>{t('login')}</Text>
            </Text>
          </Pressable>
        </>
      }
    />
  )
}

const styles = StyleSheet.create({
  top: {
    width: '100%',
    gap: 32,
  },
  title: {
    width: '100%',
    textAlign: 'center',
    writingDirection: 'rtl',
    fontFamily: 'Heebo',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: -0.2,
    color: colors.navy,
  },
  fields: {
    width: '100%',
    gap: 24,
  },
  terms: {
    flexShrink: 1,
    fontFamily: 'Heebo',
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.navy,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  termsLink: {
    color: colors.brand,
    textDecorationLine: 'underline',
  },
  linkBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  linkBody: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.ink,
    textAlign: 'center',
  },
  linkEmphasis: {
    fontWeight: '500',
  },
})
