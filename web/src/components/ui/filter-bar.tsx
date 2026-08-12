import { useMemo } from 'react'
import type { Category, Domain } from '../../api/types'
import { MultiSelect, type SelectOption } from './multi-select'

/**
 * The domain and category filters, shared by the note and card indexes.
 *
 * One component rather than the same two dropdowns written twice: the two
 * screens filter on the same vocabulary with the same semantics, and the first
 * thing that drifts when they are separate is which of them remembers to keep
 * an archived label visible.
 *
 * Selecting several within one group means *either* — the server OR's inside a
 * group and AND's between them (D-078). "Both labels at once" was the other
 * available reading and it is the wrong one for a filter bar: the second click
 * would almost always empty the screen, which reads as broken rather than as
 * precise.
 */
export function FilterBar({
  domains,
  categories,
  domainIds,
  categoryIds,
  onToggle,
  onClear,
}: {
  domains: Domain[] | undefined
  categories: Category[] | undefined
  domainIds: string[]
  categoryIds: string[]
  /**
   * Flip one value of one query parameter.
   *
   * Keyed by the parameter name rather than split into two callbacks, because
   * both pages hold this selection in the URL and apply it the same way: read
   * the *latest* values for that key, flip one, write them back. Passing the
   * resulting array up instead would compute it from props that a rapid second
   * click has already outrun.
   */
  onToggle: (key: 'domainId' | 'categoryId', id: string) => void
  onClear: (key: 'domainId' | 'categoryId') => void
}) {
  const domainOptions = useMemo(
    () => options(domains, domainIds),
    [domains, domainIds],
  )
  const categoryOptions = useMemo(
    () => options(categories, categoryIds),
    [categories, categoryIds],
  )

  // Nothing to filter by yet. An account with no domains and no categories
  // gets a search box and no empty dropdowns beside it.
  if (domainOptions.length === 0 && categoryOptions.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {domainOptions.length > 0 && (
        <MultiSelect
          label="Domain"
          options={domainOptions}
          selected={domainIds}
          onToggle={(id) => onToggle('domainId', id)}
          onClear={() => onClear('domainId')}
          searchPlaceholder="Cari domain…"
          emptyText="Belum ada domain."
        />
      )}
      {categoryOptions.length > 0 && (
        <MultiSelect
          label="Kategori"
          options={categoryOptions}
          selected={categoryIds}
          onToggle={(id) => onToggle('categoryId', id)}
          onClear={() => onClear('categoryId')}
          searchPlaceholder="Cari kategori…"
          emptyText="Belum ada kategori."
        />
      )}
    </div>
  )
}

/**
 * What the dropdown offers: the live set, plus anything already selected.
 *
 * Archived labels leave the pickers (D-051) and a filter is a picker, so they
 * are not offered. But an archived label still labels everything it ever
 * labelled, and a link that filters by one has to keep working — otherwise the
 * dropdown would say "Domain" while the list underneath was filtered, which is
 * the screen lying about its own state.
 */
function options(
  items: { id: string; label: string; color: string; archivedAt: string | null }[] | undefined,
  selected: string[],
): SelectOption[] {
  const chosen = new Set(selected)
  return (items ?? [])
    .filter((i) => i.archivedAt === null || chosen.has(i.id))
    .map((i) => ({ id: i.id, label: i.label, color: i.color }))
}
