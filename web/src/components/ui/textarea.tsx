import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full resize-y rounded-md border border-input bg-card p-3 text-sm leading-relaxed text-card-fg',
        'placeholder:text-subtle-fg',
        'transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
