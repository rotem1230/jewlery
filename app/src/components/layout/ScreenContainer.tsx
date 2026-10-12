import type { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cn } from '@/src/lib/cn'

type ScreenContainerProps = {
  children: ReactNode
  scroll?: boolean
  className?: string
  contentClassName?: string
  edges?: Array<'top' | 'bottom'>
}

export function ScreenContainer({
  children,
  scroll,
  className,
  contentClassName,
  edges = ['top', 'bottom'],
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets()
  const padding = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
  }

  if (scroll) {
    return (
      <ScrollView
        className={cn('flex-1 bg-surface', className)}
        contentContainerClassName={cn('px-page', contentClassName)}
        contentContainerStyle={padding}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    )
  }

  return (
    <View className={cn('flex-1 bg-surface px-page', className)} style={padding}>
      {children}
    </View>
  )
}
