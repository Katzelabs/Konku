import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

const textarea = cva(
  'w-full text-sm leading-relaxed text-card-fg placeholder:text-subtle-fg transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        /** A form field: bordered, sits among other controls. */
        default: 'resize-y rounded-md border border-input bg-card p-3',

        /**
         * A writing surface: the note body, a card side. No border, no fill,
         * and **no focus ring**.
         *
         * That last part is a deliberate exception to the global
         * `:focus-visible` rule in theme.css, which says never to remove it —
         * and it stays true everywhere else. A 2px outline drawn around a
         * 30rem writing area is not a focus indicator, it is a box you are
         * typing inside, and it fights the "quiet" the rest of the palette is
         * built for. The exception is safe *only* because a text area has a
         * blinking caret: focus is already unambiguous without the ring. Do
         * not copy this variant onto a button, a link, or anything that has no
         * caret of its own.
         */
        plain: 'resize-none border-0 bg-transparent p-0 focus-visible:outline-none',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Textarea({
  className,
  variant,
  ...props
}: ComponentProps<'textarea'> & VariantProps<typeof textarea>) {
  return <textarea className={cn(textarea({ variant, className }))} {...props} />
}
