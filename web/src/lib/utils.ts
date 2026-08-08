import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones.
 *
 * Without twMerge, `cn('px-4', props.className)` cannot be overridden by a
 * caller passing `px-6` — both land in the class list and the cascade picks by
 * stylesheet order, not by intent.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
