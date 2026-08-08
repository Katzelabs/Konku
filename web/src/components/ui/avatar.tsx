import { cn } from '../../lib/utils'

/**
 * Initials, not a photo.
 *
 * The user record is `{ id, email }` — there is no name and no avatar column,
 * and the mockup's photo upload is not in scope (D-054). Deriving two letters
 * from the email gives the same visual anchor without inventing a feature.
 */
export function Avatar({
  email,
  className,
}: {
  email: string
  className?: string
}) {
  const local = email.split('@')[0] ?? ''
  const initials =
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || email.slice(0, 2).toUpperCase()

  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg',
        className,
      )}
    >
      {initials}
    </span>
  )
}
