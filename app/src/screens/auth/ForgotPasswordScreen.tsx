import { useState } from 'react'
import { Alert, Text, View, StyleSheet } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AuthScreenLayout } from '@/src/components/auth/AuthScreenLayout'
import { Button, Field } from '@/src/components/ui'
import { forgotPassword } from '@/src/api/auth'
import { parseApiError } from '@/src/lib/api'
import { isValidEmail } from '@/src/lib/validation'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'
import type { AuthStackParamList } from '@/src/navigation/types'

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>

export function ForgotPasswordScreen({ navigation }: Props) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const onSend = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      setError(t('validationRequired'))
      return
    }
    if (!isValidEmail(trimmed)) {
      setError(t('validationEmail'))
      return
    }
    setBusy(true)
    try {
      await forgotPassword(trimmed)
      Alert.alert(t('authErrorTitle'), t('authForgotSent'), [
        { text: t('login'), onPress: () => navigation.navigate('Login') },
      ])
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthScreenLayout
      layout="stack"
      top={
        <View style={styles.top}>
          <Text style={styles.title}>{t('forgotSubtitle')}</Text>
          <View style={styles.fields}>
            <Field
              label={t('email')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              textContentType="emailAddress"
              value={email}
              error={error}
              onChangeText={(value) => {
                setEmail(value)
                setError(undefined)
              }}
            />
          </View>
        </View>
      }
      bottom={
        <>
          <Button fullWidth disabled={busy} onPress={() => void onSend()}>
            {t('sendResetLink')}
          </Button>
          <Button fullWidth variant="outline" onPress={() => navigation.goBack()}>
            {t('cancel')}
          </Button>
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
})
