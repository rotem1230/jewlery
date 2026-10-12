import type { ReactNode } from 'react'
import { Pressable, Text, type PressableProps } from 'react-native'
import {
  buttonClasses,
  buttonTextClasses,
  type ButtonSize,
  type ButtonVariant,
} from '@/src/theme/variants/button'
import { cn } from '@/src/lib/cn'

type ButtonProps = PressableProps & {
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
  ...props
}: ButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      className={cn(
        buttonClasses({ variant, size, fullWidth, pill }),
        disabled && 'opacity-50',
        className,
      )}
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
