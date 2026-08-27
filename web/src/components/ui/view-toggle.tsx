import { LayoutGrid, List } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useCopy } from '../../i18n'

export type ViewMode = 'list' | 'grid'

/**
 * Grid or list, for the notes and cards indexes.
 *
 * The choice lives in the URL rather than in component state, beside the `?q=`
 * filter that is already there. That makes a filtered grid a link someone can
 * bookmark or reload into, and it keeps the two from disagreeing — the same
 * reason the notes search box moved to the URL.
 */
export function useViewMode(
  storageKey: string,
): [ViewMode, (v: ViewMode) => void] {
  const [params, setParams] = useSearchParams()

  const fromUrl = params.get('view')
  // localStorage is the fallback, not the source of truth: it remembers the
  // preference across visits without ever overriding an explicit URL.
  const mode: ViewMode =
    fromUrl === 'grid' || fromUrl === 'list'
      ? fromUrl
      : readStored(storageKey) ?? 'list'

  function setMode(next: ViewMode) {
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // Private browsing or a full quota. A forgotten preference is not worth
      // a broken click.
    }
    const updated = new URLSearchParams(params)
    updated.set('view', next)
    setParams(updated, { replace: true, preventScrollReset: true })
  }

  return [mode, setMode]
}

function readStored(key: string): ViewMode | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === 'grid' || raw === 'list' ? raw : null
  } catch {
    return null
  }
}

export function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode
  onChange: (v: ViewMode) => void
}) {
  // Icons only, so all three of these are accessible names rather than text on
  // screen. This is the only control over the two index screens (D-078) and
  // the copy says exactly that much and no more.
  const c = useCopy().common.view

  return (
    <div
      role="group"
      aria-label={c.label}
      className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5"
    >
      <ViewButton
        active={mode === 'list'}
        label={c.list}
        onClick={() => onChange('list')}
      >
        <List className="size-4" />
      </ViewButton>
      <ViewButton
        active={mode === 'grid'}
        label={c.grid}
        onClick={() => onChange('grid')}
      >
        <LayoutGrid className="size-4" />
      </ViewButton>
    </div>
  )
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // The icons carry no text, so the accessible name has to come from here.
      aria-label={label}
      title={label}
      className={
        'rounded-sm p-1.5 transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) ' +
        (active
          ? 'bg-accent text-accent-fg'
          : 'text-subtle-fg hover:bg-muted hover:text-surface-fg')
      }
    >
      {children}
    </button>
  )
}
