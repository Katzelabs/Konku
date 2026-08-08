import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * The block every screen opens with: what this is, one line of why, and the
 * actions that belong to the whole page on the right.
 *
 * `actions` takes a fragment when a screen genuinely has more than one — but
 * only one of them should be `variant="primary"`. Two primaries on a screen
 * means neither is the obvious next step.
 *
 * Breadcrumbs are not here. They live in the top bar, which is the same place
 * on every screen; repeating the location inside the page would say it twice.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: string
  description?: string
  /** Counts, dates, status — sits under the description in quiet type. */
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-surface-fg">
          {title}
        </h1>
        {description && (
          <p className="max-w-prose text-sm text-muted-fg">{description}</p>
        )}
        {meta && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle-fg">
            {meta}
          </div>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  )
}
