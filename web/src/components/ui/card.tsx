import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/**
 * A panel. Border-first, no shadow — shadows in this system are reserved for
 * things that genuinely float (the focus pill, dialogs).
 */
const card = cva('rounded-lg border', {
  variants: {
    tone: {
      default: 'border-border bg-card text-card-fg',
      /**
       * The panel around an irreversible action, and nothing else.
       *
       * Same rule as the `destructive` button variant (D-054, hard rule 6):
       * this is for deleting data, never for a review outcome, a missed day,
       * or an error the user can simply undo. It exists because a red button
       * inside an otherwise ordinary settings card carries the whole warning
       * on the label — the panel should be the thing that reads as different
       * before anything is pointed at.
       */
      danger: 'border-destructive/35 bg-destructive-muted text-card-fg',
    },
  },
  defaultVariants: { tone: 'default' },
})

export function Card({
  className,
  tone,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof card>) {
  return <div className={cn(card({ tone, className }))} {...props} />
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-1 px-5 pt-5 pb-3', className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('text-base font-semibold text-card-fg', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-fg', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-t border-border px-5 py-3',
        className,
      )}
      {...props}
    />
  )
}
