import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { cn } from '@/src/lib/cn'

type IconButtonProps = Omit<PressableProps, 'style'> & {
  className?: string
  /** A plain style (NativeWind drops a Pressable style given as a function). */
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

export function IconButton({ className, children, disabled, style, ...props }: IconButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      className={cn('h-10 w-10 items-center justify-center rounded-lg active:bg-neutral-100', className)}
      // The faded look follows `disabled` through a plain style, as in Button (a toggled class stayed).
      style={[disabled ? styles.disabled : null, style]}
      {...props}
    >
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
})
