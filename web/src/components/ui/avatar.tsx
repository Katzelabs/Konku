import { cn } from '../../lib/utils'

/**
 * Initials, not a photo.
 *
 * There is no avatar column and the mockup's photo upload is not in scope
 * (D-054). Two letters give the same visual anchor without inventing a
 * feature.
 *
 * It takes the letters rather than deriving them. Since 00010 an account may
 * have a name or only an address, and the rule for choosing between them is
 * the same one the account menu and any greeting use — so it lives once, in
 * `features/auth/displayName.ts`, instead of here where a second copy would
 * quietly disagree.
 */
export function Avatar({
  initials,
  className,
}: {
  initials: string
  className?: string
}) {
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
