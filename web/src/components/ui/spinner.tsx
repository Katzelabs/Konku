import { Loader2 } from 'lucide-react'
import { useCopy } from '../../i18n'
import { cn } from '../../lib/utils'

/**
 * The standard loading state. Always paired with text — a bare spinner tells
 * you something is happening but not what, and every loading state in this app
 * already knows.
 *
 * The fallback used to be `label = 'Memuat…'`, a **default parameter**, which
 * is the one place copy hides from review: it is not JSX, it does not read as
 * a sentence in a diff, and `check-i18n` had no reason to look at this file at
 * all. Ten call sites take the default, so it stayed Indonesian on ten screens
 * in both locales. `common.loading` is the fallback now; `label` still exists
 * for a caller that knows what it is waiting for.
 */
export function Loading({
  label,
  className,
}: {
  label?: string
  className?: string
}) {
  const c = useCopy()

  return (
    <div
      role="status"
      className={cn('flex items-center gap-2 text-sm text-muted-fg', className)}
    >
      <Loader2 className="size-4 animate-spin-quiet" aria-hidden />
      {label ?? c.common.loading}
    </div>
  )
}
