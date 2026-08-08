import { Check, Plus, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Category, Domain } from '../../api/types'
import { cn } from '../../lib/utils'
import { DomainDot } from './badge'
import { CategoryChip, CategoryPicker } from './category'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'

/**
 * An item's properties, shown above its title.
 *
 * These lived in a right-hand drawer first, which was the wrong shape: domain
 * and categories are part of writing the thing, not a panel you open to
 * inspect it. Above the title they are set in the same pass as the text, and
 * the editor keeps the whole width for the editor.
 *
 * Quiet by construction — label in subtle grey, value in a borderless control
 * that only shows its edges on hover. A row of boxed form fields above a title
 * reads as a form to fill in before you are allowed to write, which is exactly
 * the friction that stops things being captured (hard rule 7).
 */
export function PropertyBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>
}

export function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="flex w-32 shrink-0 items-center gap-1.5 py-1.5 text-xs text-subtle-fg">
        {icon}
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** The borderless control a property value sits in. */
function PropertyButton({
  onClick,
  children,
  className,
}: {
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left',
        'transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted',
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * The domain property.
 *
 * A dropdown rather than the visible ToggleGroup used elsewhere: a filter bar
 * benefits from showing every option at once, but this is one value among five
 * or more and it sits above a title that should stay the loudest thing there.
 */
export function DomainProperty({
  domains,
  value,
  onChange,
}: {
  domains: Domain[] | undefined
  value: string | null
  onChange: (id: string | null) => void
}) {
  const current = domains?.find((d) => d.id === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyButton>
          {current ? (
            <>
              <DomainDot color={current.color} />
              <span className="truncate text-card-fg">{current.label}</span>
            </>
          ) : (
            <span className="text-subtle-fg">Pilih domain</span>
          )}
        </PropertyButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex-1 text-muted-fg">Tanpa domain</span>
          {value === null && <Check className="size-3.5" />}
        </DropdownMenuItem>
        {(domains ?? []).map((d) => (
          <DropdownMenuItem key={d.id} onSelect={() => onChange(d.id)}>
            <DomainDot color={d.color} />
            <span className="flex-1 truncate">{d.label}</span>
            {value === d.id && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The categories property: chips, plus an inline picker that expands in place.
 *
 * The picker is not inside a dropdown menu on purpose. Radix menus own typeahead
 * and roving focus, so a text input inside one loses keystrokes to the menu —
 * and typing is the entire interaction here, since categories are created by
 * typing a name that does not exist yet.
 */
export function CategoryProperty({
  categories,
  selected,
  onChange,
  onCreate,
  creating,
}: {
  categories: Category[] | undefined
  selected: string[]
  onChange: (ids: string[]) => void
  onCreate: (label: string) => Promise<Category | null>
  creating?: boolean
}) {
  const [open, setOpen] = useState(false)

  const chosen = (categories ?? []).filter((c) => selected.includes(c.id))

  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <div className="rounded-md border border-border bg-card p-2">
          <CategoryPicker
            categories={categories ?? []}
            selected={selected}
            onChange={onChange}
            onCreate={onCreate}
            creating={creating}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 flex items-center gap-1 rounded-sm px-1 text-xs text-muted-fg transition-colors hover:text-surface-fg"
          >
            <X className="size-3" />
            Selesai
          </button>
        </div>
      ) : (
        <PropertyButton onClick={() => setOpen(true)} className="flex-wrap gap-1.5">
          {chosen.length > 0 ? (
            chosen.map((c) => <CategoryChip key={c.id} label={c.label} />)
          ) : (
            <span className="text-subtle-fg">Tambah kategori</span>
          )}
          {chosen.length > 0 && <Plus className="size-3.5 text-subtle-fg" />}
        </PropertyButton>
      )}
    </div>
  )
}
