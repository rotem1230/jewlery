import { View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AuthScreenLayout } from '@/src/components/auth/AuthScreenLayout'
import { Button, AppText } from '@/src/components/ui'
import { useTranslation } from '@/src/i18n'
import { BackendStatusBanner } from '@/src/components/BackendStatusBanner'
import type { AuthStackParamList } from '@/src/navigation/types'

type Props = NativeStackScreenProps<AuthStackParamList, 'RoleSelect'>

export function RoleSelectScreen({ navigation }: Props) {
  const { t } = useTranslation()

  return (
    <AuthScreenLayout
      top={
        <AppText className="w-full text-center text-subtitle font-medium text-navy">
          {t('chooseRole')}
        </AppText>
      }
      bottom={
        <View className="w-full gap-action-gap">
          <Button fullWidth onPress={() => navigation.navigate('Login', { role: 'DESIGNER' })}>
            {t('enterAsDesigner')}
          </Button>
          <Button
            fullWidth
            variant="outline"
            onPress={() => navigation.navigate('Login', { role: 'JEWELER' })}
          >
            {t('enterAsJeweler')}
          </Button>
          <Button fullWidth variant="ghost" onPress={() => navigation.navigate('Login')}>
            {t('login')}
          </Button>
          <Button
            fullWidth
            variant="ghost"
            onPress={() => navigation.navigate('Signup', { role: 'DESIGNER' })}
          >
            {t('signupAsDesigner')}
          </Button>
          <Button
            fullWidth
            variant="ghost"
            onPress={() => navigation.navigate('Signup', { role: 'JEWELER' })}
          >
            {t('signupAsJeweler')}
          </Button>
          <BackendStatusBanner />
        </View>
      }
    />
  )
}
