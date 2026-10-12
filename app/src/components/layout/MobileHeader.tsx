import { View } from 'react-native'
import { Heading, AppText } from '@/src/components/ui'
import { IconButton } from '@/src/components/ui/IconButton'
import { ChevronLeft } from 'lucide-react-native'
import { colors } from '@/src/theme/tokens'
import { cn } from '@/src/lib/cn'

type MobileHeaderProps = {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: React.ReactNode
  className?: string
}

export function MobileHeader({ title, subtitle, onBack, right, className }: MobileHeaderProps) {
  return (
    <View className={cn('h-header flex-row items-center justify-between', className)}>
      <View className="min-w-[40px] flex-row items-center">
        {onBack ? (
          <IconButton onPress={onBack} accessibilityLabel="Back">
            <ChevronLeft color={colors.textPrimary} size={24} />
          </IconButton>
        ) : null}
      </View>
      <View className="flex-1 items-center px-sm">
        <Heading level="subtitle" className="text-center">
          {title}
        </Heading>
        {subtitle ? (
          <AppText variant="tag" className="text-center">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View className="min-w-[40px] items-end">{right}</View>
    </View>
  )
}
