import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

const notice = cva('rounded-md px-3 py-2 text-sm', {
  variants: {
    variant: {
      /**
       * The default, and what almost every message in this app should be.
       * Server errors are already user-facing Indonesian from `writeError`;
       * they are information, not a telling-off, so they get no red.
       */
      neutral: 'bg-muted text-secondary-fg',
      /** Something the user is about to lose. Delete confirmations only. */
      /* `destructive-ink`, not `destructive`: the fill value is solved under a
         white label and measures 3.2:1 as text on this tint in `.dark`. */
      destructive: 'bg-destructive-muted text-destructive-ink',
    },
  },
  defaultVariants: { variant: 'neutral' },
})

export function Notice({
  className,
  variant,
  ...props
}: ComponentProps<'p'> & VariantProps<typeof notice>) {
  return <p className={cn(notice({ variant, className }))} {...props} />
}
