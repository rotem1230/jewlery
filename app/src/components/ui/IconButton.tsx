import { Pressable, type PressableProps } from 'react-native'
import { cn } from '@/src/lib/cn'

type IconButtonProps = PressableProps & {
  className?: string
  children: React.ReactNode
}

export function IconButton({ className, children, disabled, ...props }: IconButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      className={cn(
        'h-10 w-10 items-center justify-center rounded-lg active:bg-neutral-100',
        disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </Pressable>
  )
}
