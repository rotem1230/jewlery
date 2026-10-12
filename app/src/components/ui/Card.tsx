import type { ReactNode } from 'react'
import { View } from 'react-native'
import { cardClasses } from '@/src/theme/variants/card'
import { cn } from '@/src/lib/cn'

type CardProps = {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return <View className={cn(cardClasses(), className)}>{children}</View>
}
