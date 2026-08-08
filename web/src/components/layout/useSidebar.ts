import { useCallback, useState } from 'react'

const STORAGE_KEY = 'konku.sidebar'

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed'
  } catch {
    return false
  }
}

/**
 * Whether the desktop sidebar is collapsed to icons.
 *
 * Persisted, because a layout preference that resets on every reload is worse
 * than not having one. Client state, so it stays out of TanStack Query (D-044)
 * and out of the account — there is still no per-user settings table.
 */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState(load)

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded')
      } catch {
        // The choice still applies for this tab.
      }
      return next
    })
  }, [])

  return { collapsed, toggle }
}
