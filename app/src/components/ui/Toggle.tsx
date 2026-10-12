import { Pressable, View } from 'react-native'
import { cn } from '@/src/lib/cn'
import { AppText } from './Typography'

type ToggleProps = {
  value: boolean
  onChange: (next: boolean) => void
  label?: string
  className?: string
}

export function Toggle({ value, onChange, label, className }: ToggleProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      className={cn('flex-row items-center justify-between', className)}
    >
      {label ? <AppText>{label}</AppText> : null}
      <View
        className={cn(
          'h-7 w-12 justify-center rounded-button-pill px-0.5',
          value ? 'bg-brand' : 'bg-neutral-300',
        )}
      >
        <View
          className={cn(
            'h-6 w-6 rounded-full bg-surface',
            value ? 'self-end' : 'self-start',
          )}
        />
      </View>
    </Pressable>
  )
}
