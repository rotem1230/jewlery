import { View, Text } from 'react-native'
import { cn } from '@/src/lib/cn'

type PillBadgeProps = {
  label: string
  tone?: 'brand' | 'neutral' | 'success' | 'warning' | 'danger'
  className?: string
}

const tones: Record<NonNullable<PillBadgeProps['tone']>, string> = {
  brand: 'bg-brand-100 text-text-brand',
  neutral: 'bg-neutral-100 text-text-secondary',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
}

export function PillBadge({ label, tone = 'brand', className }: PillBadgeProps) {
  return (
    <View className={cn('self-start rounded-button-pill px-sm py-xxs', tones[tone], className)}>
      <Text className={cn('font-sans text-tag font-medium', tones[tone])}>{label}</Text>
    </View>
  )
}
