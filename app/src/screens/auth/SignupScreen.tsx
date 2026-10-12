import { useState } from 'react'
import { Alert, Pressable, Text, View, StyleSheet } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AuthScreenLayout } from '@/src/components/auth/AuthScreenLayout'
import { GoogleAuthButton } from '@/src/components/auth/GoogleAuthButton'
import { PhoneField } from '@/src/components/auth/PhoneField'
import { Button, Checkbox, Field } from '@/src/components/ui'
import { oauthGoogle, register, updateMe } from '@/src/api/auth'
import { parseApiError } from '@/src/lib/api'
import { signInWithGoogleNative } from '@/src/lib/googleSignIn'
import { sessionFromAuth } from '@/src/lib/session'
import { splitFullName } from '@/src/lib/format'
import { isValidEmail, passwordIssue, toE164Phone } from '@/src/lib/validation'
import { useTranslation } from '@/src/i18n'
import { useAppDispatch } from '@/src/store/hooks'
import { setSession } from '@/src/store/store'
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
  const dispatch = useAppDispatch()
  const role = route.params?.role ?? 'DESIGNER'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [accepted, setAccepted] = useState(false)
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
      const result = await register({
        email: trimmed,
        password,
        roles: [role],
        firstName: firstName || undefined,
        lastName,
      })
      dispatch(setSession(sessionFromAuth(result)))
      if (e164) {
        await updateMe({ phone: e164 }).catch(() => undefined)
      }
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const onGoogle = async () => {
    setBusy(true)
    try {
      const profile = await signInWithGoogleNative()
      const result = await oauthGoogle(profile)
      dispatch(setSession({ ...sessionFromAuth(result), persist: true }))
    } catch (err) {
      const message =
        err instanceof Error && err.message.startsWith('google-signin')
          ? t('authGoogleUnavailable')
          : parseApiError(err)
      Alert.alert(t('authErrorTitle'), message)
    } finally {
      setBusy(false)
    }
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
            checked={accepted}
            onChange={setAccepted}
            labelNode={
              <Text style={styles.terms}>
                {t('acceptTermsPrefix')}
                <Text style={styles.termsLink} onPress={() => navigation.navigate('Terms')}>
                  {t('termsLink')}
                </Text>
              </Text>
            }
          />
        </View>
      }
      bottom={
        <>
          <Button fullWidth disabled={!accepted || busy} onPress={() => void onSignup()}>
            {t('signup')}
          </Button>
          <GoogleAuthButton onPress={() => void onGoogle()} />
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
