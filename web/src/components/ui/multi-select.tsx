import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCopy } from '../../i18n'
import { cn } from '../../lib/utils'
import { DomainDot } from './badge'
import { Input } from './input'

/**
 * One thing that can be filtered on. `color` is optional so this works for
 * anything with a label; domains and categories both have one (D-074).
 */
export interface SelectOption {
  id: string
  label: string
  color?: string
}

/**
 * Filter by several of something, searching to find them.
 *
 * It replaces the row of `ToggleGroupItem` chips the index screens used to
 * filter with. Chips were fine at five seeded domains and stopped being fine
 * the moment categories were create-on-type: a filter bar that grows a line
 * every time you label something pushes the list it filters off the screen,
 * and there was no way to say "either of these two".
 *
 * **Popover, not DropdownMenu.** A Radix menu owns typeahead and roving focus,
 * so a text input inside one loses its keystrokes to the menu — the same reason
 * `CategoryProperty` expands its picker inline instead. Searching is the whole
 * interaction here, so the menu primitive is the wrong one. Popover is a
 * dismissable layer with a focus scope and nothing that competes for keys, and
 * every one of its transitive dependencies was already installed by dialog and
 * dropdown-menu, so it discharges a real obligation at no weight (D-065).
 */
export function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchPlaceholder,
  emptyText,
  className,
}: {
  /** What the trigger says with nothing chosen. Also its accessible name. */
  label: string
  options: SelectOption[]
  /** What is chosen, for display. Not the input to the next selection. */
  selected: string[]
  /**
   * One id, flipped.
   *
   * It emits the *intent* rather than the resulting array on purpose. The
   * caller keeps this selection in the URL, and ticking two options in quick
   * succession is one gesture — the second click lands before the first
   * navigation has re-rendered anything, so a `[...selected, id]` computed
   * here would be built from a `selected` that predates the first click and
   * would drop it. Set arithmetic belongs wherever the current truth is.
   */
  onToggle: (id: string) => void
  onClear: () => void
  searchPlaceholder: string
  /** Shown when there is nothing to choose from at all. */
  emptyText: string
  className?: string
}) {
  // `label`, `searchPlaceholder` and `emptyText` name the *thing* being
  // filtered and only the caller knows it. The two strings below name the
  // dropdown's own states and are the same in every use, so they come from
  // the catalog directly rather than through two more props.
  const c = useCopy().common.filter

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  // Named from `options`, not from `selected`: an id whose option has gone —
  // an archived domain, a deleted category — would otherwise be counted in the
  // summary and be impossible to find in the list underneath.
  const chosen = useMemo(
    () => options.filter((o) => selectedSet.has(o.id)),
    [options, selectedSet],
  )

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // The search text belongs to one visit. Reopening to a stale query
        // shows a filtered list that looks like a filtered *result*.
        if (!next) setQuery('')
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'flex h-9 min-w-0 items-center gap-1.5 rounded-md border border-input bg-card px-2.5',
            'text-sm transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
            'hover:bg-muted',
            chosen.length > 0 ? 'text-card-fg' : 'text-subtle-fg',
            className,
          )}
        >
          {/* The first choice's colour, so the trigger reads as "Matematika"
              rather than "1 dipilih" whenever it can. */}
          {chosen.length > 0 && chosen[0].color && <DomainDot color={chosen[0].color} />}
          <span className="truncate">
            {chosen.length === 0 ? label : chosen[0].label}
          </span>
          {chosen.length > 1 && (
            <span className="shrink-0 rounded-sm bg-muted px-1 text-xs text-muted-fg">
              +{chosen.length - 1}
            </span>
          )}
          <ChevronDown className="size-3.5 shrink-0 text-subtle-fg" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 w-64 rounded-lg border border-border bg-popover p-2 text-popover-fg shadow-float',
            'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
          )}
        >
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-subtle-fg">{emptyText}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle-fg" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 pl-8 text-sm"
                />
              </div>

              <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                {matches.map((o) => {
                  const on = selectedSet.has(o.id)
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => onToggle(o.id)}
                        aria-pressed={on}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                          'transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
                          on
                            ? 'bg-accent text-accent-fg'
                            : 'text-muted-fg hover:bg-muted hover:text-surface-fg',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {o.color && <DomainDot color={o.color} className="size-2" />}
                          <span className="truncate">{o.label}</span>
                        </span>
                        {on && <Check className="size-3.5 shrink-0" />}
                      </button>
                    </li>
                  )
                })}

                {matches.length === 0 && (
                  <li className="px-2 py-1.5 text-sm text-subtle-fg">
                    {c.noMatch}
                  </li>
                )}
              </ul>

              {/*
                Clearing lives here rather than as an × on the trigger. On the
                trigger it sits one pixel from "open the filter" and is the
                easier of the two to hit by accident.
              */}
              {chosen.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-muted-fg transition-colors hover:text-surface-fg"
                >
                  <X className="size-3" />
                  {c.clearSelection}
                </button>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
