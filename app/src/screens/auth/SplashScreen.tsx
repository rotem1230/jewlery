import { View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BrandLogo } from '@/src/components/brand/BrandLogo'
import { Button, AppText } from '@/src/components/ui'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'
import type { AuthStackParamList } from '@/src/navigation/types'

type Props = NativeStackScreenProps<AuthStackParamList, 'Splash'>

export function SplashScreen({ navigation }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.authBg,
        paddingTop: insets.top,
        paddingBottom: Math.max(insets.bottom, 24),
      }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <BrandLogo size="md" />
        <AppText className="mt-sm text-center text-text-secondary">{t('splashTagline')}</AppText>
      </View>
      <View style={{ width: '100%', gap: 20, paddingHorizontal: 24 }}>
        <Button fullWidth onPress={() => navigation.navigate('Login')}>
          {t('login')}
        </Button>
        <Button fullWidth variant="outline" onPress={() => navigation.navigate('RoleSelect')}>
          {t('signup')}
        </Button>
        <Button fullWidth variant="ghost" onPress={() => navigation.navigate('RoleSelect')}>
          {t('chooseRole')}
        </Button>
      </View>
    </View>
  )
}
