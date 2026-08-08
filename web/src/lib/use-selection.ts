import { useCallback, useMemo, useState } from 'react'

/**
 * Which rows are ticked on a list screen.
 *
 * Genuine client state, so `useState` rather than TanStack Query — a selection
 * is not something the server knows about (D-044). It deliberately does *not*
 * live in the URL the way `?view=` and `?q=` do: a filter is worth
 * bookmarking, a set of ticked rows is not, and reloading into a half-made
 * selection of things you were about to delete would be alarming rather than
 * useful.
 *
 * `ids` is the visible list, passed on every call so the hook can answer
 * "everything" and prune. Pruning matters: tick three rows, change the filter,
 * and without it the selection bar would still offer to delete two items that
 * are no longer on screen.
 */
export function useSelection(ids: string[]) {
  const [raw, setRaw] = useState<ReadonlySet<string>>(() => new Set())

  // The visible intersection, which is what every caller actually wants.
  // Recomputed rather than written back, so a filter that hides a row and then
  // shows it again does not silently lose the tick.
  const selected = useMemo(() => {
    if (raw.size === 0) return EMPTY
    return new Set(ids.filter((id) => raw.has(id)))
  }, [ids, raw])

  const toggle = useCallback((id: string) => {
    setRaw((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setRaw(EMPTY), [])

  // Tick everything visible, or untick it if it is already all ticked. Only
  // touches what is on screen — a selection made under one filter is not
  // widened by pressing this under another.
  const toggleAll = useCallback(() => {
    setRaw((prev) => {
      const allOn = ids.length > 0 && ids.every((id) => prev.has(id))
      const next = new Set(prev)
      for (const id of ids) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [ids])

  return {
    selected,
    /** In list order, which is the order the user sees and the API is happy with. */
    ids: useMemo(() => ids.filter((id) => selected.has(id)), [ids, selected]),
    count: selected.size,
    allSelected: ids.length > 0 && selected.size === ids.length,
    toggle,
    toggleAll,
    clear,
  }
}

const EMPTY: ReadonlySet<string> = new Set()
