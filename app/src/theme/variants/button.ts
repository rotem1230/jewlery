import { cn } from '@/src/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'google'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'google'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand border border-brand active:bg-brand-600',
  secondary: 'bg-brand-100 border border-brand-100 active:bg-brand-50',
  outline: 'border border-brand bg-surface active:bg-brand-50',
  ghost: 'active:bg-neutral-100',
  google: 'border border-brand bg-surface active:bg-brand-50',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-btn-sm px-3',
  md: 'h-btn-md px-sm',
  lg: 'h-btn-lg px-5',
  google: 'h-btn-google px-sm',
}

const variantTextClasses: Record<ButtonVariant, string> = {
  primary: 'text-text-inverse',
  secondary: 'text-text-brand',
  outline: 'text-brand',
  ghost: 'text-ink',
  google: 'text-brand',
}

export function buttonClasses(options: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  pill?: boolean
  className?: string
}) {
  const { variant = 'primary', size = 'md', fullWidth, pill, className } = options
  const resolvedSize = variant === 'google' ? 'google' : size
  return cn(
    'flex-row items-center justify-center rounded-md',
    pill && 'rounded-button-pill',
    sizeClasses[resolvedSize],
    variantClasses[variant],
    fullWidth && 'w-full self-stretch',
    className,
  )
}

export function buttonTextClasses(variant: ButtonVariant = 'primary', className?: string) {
  return cn('font-sans text-body-accent font-medium', variantTextClasses[variant], className)
}
