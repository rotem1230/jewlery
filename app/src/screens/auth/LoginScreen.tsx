import { useState } from 'react'
import { Alert, Pressable, Text, View, StyleSheet } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AuthScreenLayout } from '@/src/components/auth/AuthScreenLayout'
import { GoogleAuthButton } from '@/src/components/auth/GoogleAuthButton'
import { Button, Checkbox, Field } from '@/src/components/ui'
import { isEmailNotVerified, login, oauthGoogle, resendVerification } from '@/src/api/auth'
import { parseApiError } from '@/src/lib/api'
import { signInWithGoogleNative } from '@/src/lib/googleSignIn'
import { sessionFromAuth } from '@/src/lib/session'
import { isValidEmail } from '@/src/lib/validation'
import { useTranslation } from '@/src/i18n'
import { useAppDispatch } from '@/src/store/hooks'
import { setSession } from '@/src/store/store'
import { colors } from '@/src/theme/tokens'
import type { AuthStackParamList } from '@/src/navigation/types'

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>

export function LoginScreen({ navigation, route }: Props) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const role = route.params?.role
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const onLogin = async () => {
    const trimmed = email.trim()
    const next: { email?: string; password?: string } = {}
    if (!trimmed) next.email = t('validationRequired')
    else if (!isValidEmail(trimmed)) next.email = t('validationEmail')
    if (!password) next.password = t('validationRequired')
    setErrors(next)
    if (next.email || next.password) return

    setBusy(true)
    try {
      const result = await login(trimmed, password)
      dispatch(setSession({ ...sessionFromAuth(result), persist: remember }))
    } catch (err) {
      if (isEmailNotVerified(err)) {
        Alert.alert(t('authVerifyEmailTitle'), t('authEmailNotVerified'), [
          {
            text: t('authResendVerification'),
            onPress: () => {
              resendVerification(trimmed)
                .then(() => Alert.alert(t('authVerifyEmailTitle'), t('authVerificationResent')))
                .catch((resendErr) => Alert.alert(t('authErrorTitle'), parseApiError(resendErr)))
            },
          },
          { text: 'OK' },
        ])
        return
      }
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const onGoogle = async () => {
    setBusy(true)
    try {
      const profile = await signInWithGoogleNative()
      const result = await oauthGoogle({
        idToken: profile.idToken,
        firstName: profile.firstName,
        lastName: profile.lastName,
      })
      dispatch(setSession({ ...sessionFromAuth(result), persist: remember }))
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
          <Text style={styles.title}>{t('loginSubtitle')}</Text>

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
          </View>

          <Checkbox checked={remember} onChange={setRemember} label={t('rememberMe')} />
        </View>
      }
      bottom={
        <>
          <Button fullWidth disabled={busy} onPress={() => void onLogin()}>
            {t('login')}
          </Button>
          <GoogleAuthButton onPress={() => void onGoogle()} />
          <Pressable
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.linkBtn}
          >
            <Text style={styles.linkAccent}>{t('forgotPassword')}</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Signup', role ? { role } : undefined)}
            style={styles.linkBtn}
          >
            <Text style={styles.linkBody}>
              {t('noAccountYet')}{' '}
              <Text style={styles.linkEmphasis}>{t('toSignup')}</Text>
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
  linkBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  linkAccent: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.16,
    color: colors.ink,
    textAlign: 'center',
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
