import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/**
 * Pick one from a small, always-visible set — editor mode, timer duration,
 * domain. A native <select> hides the options behind a tap, and these sets are
 * short enough that showing them costs nothing.
 */
export function ToggleGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      role="group"
      className={cn('flex flex-wrap gap-2', className)}
      {...props}
    />
  )
}

export function ToggleGroupItem({
  selected,
  className,
  ...props
}: ComponentProps<'button'> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'rounded-md border px-3 py-1.5 text-sm transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
        selected
          ? 'border-primary bg-accent font-medium text-accent-fg'
          : 'border-border bg-card text-muted-fg hover:bg-muted hover:text-surface-fg',
        className,
      )}
      {...props}
    />
  )
}
