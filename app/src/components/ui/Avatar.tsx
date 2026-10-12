import { View, Text } from 'react-native'
import { cn } from '@/src/lib/cn'

type AvatarProps = {
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  const initials = (name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <View
      className={cn(
        'items-center justify-center rounded-full bg-brand-100',
        sizeMap[size],
        className,
      )}
    >
      <Text className="font-sans text-body-sm font-medium text-text-brand">{initials}</Text>
    </View>
  )
}
