import { cn } from '@/src/lib/cn'

export function fieldClasses(options?: { error?: boolean; className?: string }) {
  return cn(
    'h-field w-full rounded-md border bg-surface px-md py-sm font-sans text-body text-text-primary',
    'shadow-xs',
    options?.error ? 'border-danger-500' : 'border-form-border',
    options?.className,
  )
}

export function fieldLabelClasses(className?: string) {
  return cn('mb-xxs self-end font-sans text-caption text-form-label', className)
}

export function fieldHintClasses(error?: boolean, className?: string) {
  return cn(
    'mt-xxs self-stretch text-right font-sans text-caption',
    error ? 'text-danger-500' : 'text-text-secondary',
    className,
  )
}
