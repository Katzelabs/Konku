import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * The standard loading state. Always paired with text — a bare spinner tells
 * you something is happening but not what, and every loading state in this app
 * already knows.
 */
export function Loading({
  label = 'Memuat…',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn('flex items-center gap-2 text-sm text-muted-fg', className)}
    >
      <Loader2 className="size-4 animate-spin-quiet" aria-hidden />
      {label}
    </div>
  )
}
