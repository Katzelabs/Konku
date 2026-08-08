import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * An empty list, an empty day, nothing due.
 *
 * Hard rule 6, and the one component most likely to break it. An empty state
 * here states the fact and offers the next action. It never implies the user
 * fell behind, never counts what they missed, and never uses an illustration
 * of disappointment. "Belum ada catatan" — not "You haven't written anything
 * yet!". A quiet day is a normal day.
 */
export function EmptyState({
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
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg bg-muted px-5 py-8',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-secondary-fg">{title}</p>
        {description && (
          <p className="max-w-prose text-sm text-muted-fg">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
