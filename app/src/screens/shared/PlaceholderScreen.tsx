import { View } from 'react-native'
import { ScreenContainer } from '@/src/components/layout/ScreenContainer'
import { MobileHeader } from '@/src/components/layout/MobileHeader'
import { AppText, Heading } from '@/src/components/ui'
import { useTranslation } from '@/src/i18n'

type PlaceholderScreenProps = {
  title: string
  onBack?: () => void
}

export function PlaceholderScreen({ title, onBack }: PlaceholderScreenProps) {
  const { t } = useTranslation()
  return (
    <ScreenContainer>
      <MobileHeader title={title} onBack={onBack} />
      <View className="flex-1 items-center justify-center gap-sm">
        <Heading level="h2">{title}</Heading>
        <AppText variant="body-sm">{t('placeholder')}</AppText>
      </View>
    </ScreenContainer>
  )
}
