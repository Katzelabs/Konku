import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

const button = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** The one action a screen actually wants you to take. One per view. */
        primary: 'bg-primary text-primary-fg hover:bg-primary/90',
        /** Everything else. The border carries it, not a fill. */
        secondary:
          'border border-border bg-secondary text-secondary-fg hover:bg-muted',
        /** Toolbar and row actions — no chrome until you point at it. */
        ghost: 'text-muted-fg hover:bg-muted hover:text-surface-fg',
        /** Selected / active states, e.g. the current nav item. */
        accent: 'bg-accent text-accent-fg hover:bg-accent/70',
        /** Inline text action. Replaces the underlined <button> pattern. */
        link: 'text-muted-fg underline underline-offset-4 hover:text-surface-fg',
        /**
         * Irreversible data actions only — deleting a note or a domain.
         *
         * Never a review outcome, never a missed day, never a score. Forgetting
         * a card is the normal case the whole scheduler is built around, not an
         * error to flag in red (hard rule 6, D-054).
         */
        destructive: 'bg-destructive text-destructive-fg hover:bg-destructive/90',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-sm [&_svg]:size-4',
        md: 'h-10 px-4 text-sm [&_svg]:size-4',
        lg: 'h-11 px-5 text-sm [&_svg]:size-5',
        icon: 'size-10 [&_svg]:size-4',
        /** For `link` — no box, no height. */
        inline: 'h-auto p-0 text-sm [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof button> & {
    /** Render as the child element — use for react-router <Link>. */
    asChild?: boolean
  }

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(button({ variant, size, className }))} {...props} />
}

export { button as buttonVariants }
