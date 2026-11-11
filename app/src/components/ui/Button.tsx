import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import {
  buttonClasses,
  buttonTextClasses,
  type ButtonSize,
  type ButtonVariant,
} from '@/src/theme/variants/button'
import { cn } from '@/src/lib/cn'

type ButtonProps = Omit<PressableProps, 'style'> & {
  /** A plain style (NativeWind drops a Pressable style given as a function). */
  style?: StyleProp<ViewStyle>
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  pill?: boolean
  children: ReactNode
  className?: string
  textClassName?: string
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  pill,
  children,
  className,
  textClassName,
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      className={cn(buttonClasses({ variant, size, fullWidth, pill }), className)}
      // The faded look follows `disabled` through a plain style. As a class toggled with it,
      // NativeWind kept it after the button was enabled ("מעבר לעיצוב" stayed faded once a size
      // was picked, though it worked).
      style={[disabled ? styles.disabled : null, style]}
      {...props}
    >
      {typeof children === 'string' ? (
        <Text className={cn(buttonTextClasses(variant), textClassName)}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
})
