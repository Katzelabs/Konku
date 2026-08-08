import { Check, Minus } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/**
 * A tick box for selecting rows on the note and card lists.
 *
 * A native `<input type="checkbox">` under a styled box, not a Radix
 * primitive: a checkbox has no focus management, no typeahead and no layering
 * to get wrong, which is the bar §4 sets for pulling one in. The native input
 * keeps the label association, the keyboard behaviour and the form semantics
 * for free — it is only visually replaced, never reimplemented.
 *
 * `indeterminate` is the "some of these are ticked" state for a select-all box.
 * It is a DOM property rather than an attribute, so it is set through a ref
 * callback; React has no prop for it.
 */
export function Checkbox({
  className,
  indeterminate = false,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { indeterminate?: boolean }) {
  const checked = Boolean(props.checked)

  return (
    <span className={cn('relative inline-flex size-4 shrink-0', className)}>
      <input
        type="checkbox"
        ref={(el) => {
          if (el) el.indeterminate = indeterminate && !checked
        }}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none flex size-4 items-center justify-center rounded-sm border transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-card',
          checked || indeterminate
            ? 'border-primary bg-primary text-primary-fg'
            : 'border-border bg-card',
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
        {!checked && indeterminate && <Minus className="size-3" strokeWidth={3} />}
      </span>
    </span>
  )
}
