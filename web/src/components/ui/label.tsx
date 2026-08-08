import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/**
 * A native <label>. Radix's Label exists to make clicks work on non-native
 * controls; every control in this app is native, so the extra package would
 * buy nothing (D-045 in spirit — keep the dependency list short).
 */
export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn(
        'text-sm font-medium text-surface-fg select-none',
        'has-[+:disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
