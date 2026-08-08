import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-fg',
        accent: 'bg-accent text-accent-fg',
        outline: 'border border-border text-muted-fg',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ variant, className }))} {...props} />
}

/**
 * A domain's colour dot.
 *
 * Domain colours are user data (`domain.color`, an arbitrary #RRGGBB the user
 * picked), not design tokens — which is exactly why the rest of the palette is
 * low-chroma. These dots should be the most saturated thing on the screen.
 */
export function DomainDot({
  color,
  className,
  ...props
}: ComponentProps<'span'> & { color: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color }}
      {...props}
    />
  )
}

/** A domain's label with its dot — the standard way a domain appears in a list. */
export function DomainBadge({
  color,
  label,
  className,
}: {
  color: string
  label: string
  className?: string
}) {
  return (
    <Badge variant="outline" className={className}>
      <DomainDot color={color} />
      {label}
    </Badge>
  )
}
