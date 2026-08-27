import type { ReactNode } from 'react'
import { useCopy } from '../../i18n'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { cn } from '../../lib/utils'

/**
 * The bar that appears once rows are ticked on a list screen.
 *
 * It sits in the flow above the list rather than floating over it. A fixed bar
 * at the bottom of the viewport would cover the last row of the very list it
 * is acting on, and on a phone it lands exactly where the bottom nav already
 * is.
 *
 * It states a count and offers actions. No "you are about to permanently
 * destroy 12 items" — deleting is soft on both resources, and the confirm
 * dialog says where things go (hard rule 6).
 *
 * Its words come from `common.selection` rather than from a prop, because they
 * are about the *mechanism*: "12 dipilih" is the same sentence over notes and
 * over cards. The one string that does differ per row is the tick box's own
 * name, and that is `SelectCheckbox`'s `label` prop below.
 */
export function SelectionBar({
  count,
  allSelected,
  onToggleAll,
  onClear,
  partial = false,
  children,
  className,
}: {
  count: number
  allSelected: boolean
  onToggleAll: () => void
  onClear: () => void
  /**
   * The list has pages the reader has not loaded, so the tick-everything box
   * reaches the rows on screen and no further (D-084).
   *
   * It is named for what it does rather than quietly meaning less than it
   * says: "semua" beside a header reading "300 catatan" would promise 300 and
   * act on 50, and the count in this bar would then be the only clue.
   */
  partial?: boolean
  /** The actions — Hapus, Kembalikan. Rendered at the end of the bar. */
  children: ReactNode
  className?: string
}) {
  const c = useCopy().common
  const selectAllLabel = partial
    ? c.selection.selectAllLoaded
    : c.selection.selectAll
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5',
        className,
      )}
    >
      <label className="flex cursor-pointer items-center gap-2.5">
        <Checkbox
          checked={allSelected}
          // Some but not all: the box shows a dash rather than pretending to
          // be either state.
          indeterminate={count > 0 && !allSelected}
          onChange={onToggleAll}
          aria-label={allSelected ? c.selection.clear : selectAllLabel}
        />
        {/* Counted through the catalog, never `${count}`: the quota is 5.000
            notes and Indonesian groups that differently from English. */}
        <span className="text-sm text-card-fg">{c.selection.count(count)}</span>
      </label>

      <div className="ml-auto flex items-center gap-2">
        {children}
        <Button variant="link" size="inline" onClick={onClear}>
          {c.cancel}
        </Button>
      </div>
    </div>
  )
}

/**
 * The tick box on a row or tile.
 *
 * Faded until the row is hovered or focused, and pinned visible once anything
 * is selected — a checkbox on every row all the time turns a reading list into
 * a form. Where there is no hover to reveal it, it is simply always visible:
 * a control that only appears on hover does not exist on a touch screen.
 *
 * The toggle lives on the input's `onChange` and nowhere else. It used to also
 * sit on a wrapping `onClick`, which meant one click ran it twice — add then
 * remove — and no row could ever be selected. Nothing needs to intercept the
 * click either: this is a *sibling* of the row's button, never inside it, so
 * there is no row handler to propagate to.
 */
export function SelectCheckbox({
  checked,
  onToggle,
  label,
  visible,
  className,
}: {
  checked: boolean
  onToggle: () => void
  /** Accessible name — the box has no text beside it. */
  label: string
  /** Forces it visible: something is selected, so the column exists. */
  visible: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex items-center transition-opacity duration-(--animate-duration-quick) ease-(--ease-quiet)',
        visible || checked
          ? 'opacity-100'
          : 'opacity-40 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100',
        className,
      )}
    >
      <Checkbox checked={checked} onChange={onToggle} aria-label={label} />
    </span>
  )
}
