import { cn } from '@/src/lib/cn'

export function cardClasses(className?: string) {
  return cn('rounded-lg border border-border-subtle-light bg-surface p-md', className)
}

export function headingClass(
  level: 'h1' | 'h2' | 'subtitle' = 'h1',
  className?: string,
) {
  const sizes = {
    h1: 'text-h1 font-bold text-text-primary',
    h2: 'text-h2 font-bold text-text-primary',
    subtitle: 'text-subtitle font-medium text-text-primary',
  }
  return cn('font-sans', sizes[level], className)
}

export function textClass(
  variant: 'body' | 'body-sm' | 'tag' = 'body',
  className?: string,
) {
  const sizes = {
    body: 'text-body text-text-primary',
    'body-sm': 'text-body-sm text-text-secondary',
    tag: 'text-tag text-text-secondary',
  }
  return cn('font-sans', sizes[variant], className)
}
