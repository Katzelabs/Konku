import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * The title block every screen opens with: name, one line of what this is for,
 * and at most one action on the right.
 */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn('flex items-start justify-between gap-4', className)}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-surface-fg">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-fg">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
