import type { ReactNode } from 'react'
import { Text as RNText } from 'react-native'
import { headingClass, textClass } from '@/src/theme/variants/card'

type HeadingProps = {
  level?: 'h1' | 'h2' | 'subtitle'
  children: ReactNode
  className?: string
}

export function Heading({ level = 'h1', children, className }: HeadingProps) {
  return <RNText className={headingClass(level, className)}>{children}</RNText>
}

type AppTextProps = {
  variant?: 'body' | 'body-sm' | 'tag'
  children: ReactNode
  className?: string
}

export function AppText({ variant = 'body', children, className }: AppTextProps) {
  return <RNText className={textClass(variant, className)}>{children}</RNText>
}
