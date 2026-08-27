import { Check, Plus, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { Category } from '../../api/types'
import { useCopy } from '../../i18n'
import { cn } from '../../lib/utils'
import { Badge, DomainDot } from './badge'
import { Input } from './input'

/**
 * A category label.
 *
 * It carries a colour since 00011, which D-054 had ruled out. The rejected
 * thing was a *second tinted palette* next to the domain badge — chips with
 * coloured fills next to a coloured pill is what turns a row into confetti,
 * and that is still not what this does. The colour arrives as the same 10px
 * dot a domain wears, on the same neutral outline chip: enough to tell two
 * labels apart at a glance, not enough to compete with the text.
 *
 * `color` is optional so the style guide and any caller that only has a label
 * still renders. Missing means no dot, not a black one.
 */
export function CategoryChip({
  label,
  color,
  onRemove,
  className,
}: {
  label: string
  color?: string
  onRemove?: () => void
  className?: string
}) {
  const c = useCopy().common.picker.category

  return (
    <Badge variant="outline" className={cn('gap-1', className)}>
      {color && <DomainDot color={color} className="size-2" />}
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={c.remove(label)}
          className="-mr-0.5 rounded-sm text-subtle-fg transition-colors hover:text-surface-fg"
        >
          <X className="size-3" />
        </button>
      )}
    </Badge>
  )
}

/**
 * Pick categories, creating them by typing.
 *
 * Create-on-type is the whole point. Being sent to a settings screen to define
 * a label before you can apply it is exactly the friction that stops things
 * being captured at all (hard rule 7), so an unrecognised name becomes a new
 * category on Enter and the API is idempotent about it.
 *
 * Its words are `common.picker.category`, not `categories.*`, and that is the
 * categories catalog's own instruction: this path is reached from the note and
 * card editors rather than from `/categories`, so its copy lives with the
 * picker while that area stays the tidying-up screen.
 */
export function CategoryPicker({
  categories,
  selected,
  onChange,
  onCreate,
  creating,
}: {
  categories: Category[]
  selected: string[]
  onChange: (ids: string[]) => void
  onCreate: (label: string) => Promise<Category | null>
  creating?: boolean
}) {
  // Named `copy`, not `c`: two `.map`s below already bind `c` to a category,
  // and a shadowed catalog handle is the kind of thing that compiles.
  const copy = useCopy().common.picker.category
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((c) => c.label.toLowerCase().includes(q))
  }, [categories, query])

  // An exact match means Enter should select rather than create, otherwise
  // typing a name you already have looks like it made a duplicate.
  const exact = useMemo(
    () =>
      categories.find(
        (c) => c.label.toLowerCase() === query.trim().toLowerCase(),
      ),
    [categories, query],
  )

  function toggle(id: string) {
    onChange(
      selectedSet.has(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    )
  }

  async function commit() {
    const label = query.trim()
    if (!label) return

    if (exact) {
      if (!selectedSet.has(exact.id)) toggle(exact.id)
      setQuery('')
      return
    }

    const created = await onCreate(label)
    if (created) {
      // Idempotent on the server, so this may be a category that already
      // existed under a different capitalisation — selecting is right either
      // way.
      if (!selectedSet.has(created.id)) onChange([...selected, created.id])
      setQuery('')
    }
    input.current?.focus()
  }

  const chosen = categories.filter((c) => selectedSet.has(c.id))

  return (
    <div className="flex flex-col gap-2">
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.label}
              color={c.color}
              onRemove={() => toggle(c.id)}
            />
          ))}
        </div>
      )}

      <Input
        ref={input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // The picker lives inside the note and card forms; without this
            // Enter submits them instead of adding the label.
            e.preventDefault()
            void commit()
          }
        }}
        placeholder={copy.search}
        disabled={creating}
        className="text-sm"
      />

      <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {matches.map((c) => {
          const on = selectedSet.has(c.id)
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
                  on
                    ? 'bg-accent text-accent-fg'
                    : 'text-muted-fg hover:bg-muted hover:text-surface-fg',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <DomainDot color={c.color} className="size-2" />
                  <span className="truncate">{c.label}</span>
                </span>
                {on && <Check className="size-3.5 shrink-0" />}
              </button>
            </li>
          )
        })}

        {query.trim() && !exact && (
          <li>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={creating}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary-ink transition-colors hover:bg-muted disabled:opacity-60"
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="truncate">{copy.create(query.trim())}</span>
            </button>
          </li>
        )}

        {matches.length === 0 && !query.trim() && (
          <li className="px-2 py-1.5 text-sm text-subtle-fg">
            {copy.empty}
          </li>
        )}
      </ul>
    </div>
  )
}

/** The read-only row of labels, for list and grid items. */
export function CategoryChips({
  ids,
  categories,
  className,
}: {
  ids: string[]
  categories: Category[] | undefined
  className?: string
}) {
  if (!ids.length || !categories) return null

  const labels = ids
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => c !== undefined)
  if (!labels.length) return null

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {labels.map((c) => (
        <CategoryChip key={c.id} label={c.label} color={c.color} />
      ))}
    </div>
  )
}
