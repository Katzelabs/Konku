import * as Primitive from '@radix-ui/react-dropdown-menu'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/**
 * Radix again for the reasons Dialog gets it: roving focus, typeahead, Escape,
 * outside dismissal, and `aria-*` wiring that is easy to fake and hard to get
 * right.
 */
export const DropdownMenu = Primitive.Root
export const DropdownMenuTrigger = Primitive.Trigger

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-fg shadow-float',
          'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}

const item = cva(
  'flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-hidden select-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'text-secondary-fg data-highlighted:bg-muted data-highlighted:text-surface-fg [&_svg]:text-subtle-fg',
        /**
         * Leaving, in the sense the destructive button variant means it: the
         * item you did not mean to click.
         *
         * Hard rule 6 rules out red for anything punitive, and signing out is
         * not a punishment — but it is the one entry in this menu that throws
         * away what you are in the middle of, and it sits directly under
         * "Pengaturan". Colour is what stops the two being the same gesture.
         *
         * The icon inherits the text colour here rather than staying subtle,
         * because a red label with a grey icon reads as a rendering mistake.
         */
        destructive:
          'text-destructive-ink data-highlighted:bg-destructive-muted data-highlighted:text-destructive-ink [&_svg]:text-destructive-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function DropdownMenuItem({
  className,
  variant,
  ...props
}: ComponentProps<typeof Primitive.Item> & VariantProps<typeof item>) {
  return <Primitive.Item className={cn(item({ variant, className }))} {...props} />
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={cn('px-3 py-2 text-xs text-subtle-fg', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitive.Separator>) {
  return (
    <Primitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}
