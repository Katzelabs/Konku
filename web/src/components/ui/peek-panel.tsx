import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Maximize2, PanelRight, SquareArrowOutUpRight, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { DialogOverlay, DialogPortal } from './dialog'

/**
 * How opening an item from a list behaves.
 *
 * `side` and `center` preview it without leaving the list; `full` skips the
 * preview and navigates. The point of a peek is that scanning a list and
 * reading one item are the same task — losing your place in the list to read
 * one note is the friction this removes.
 */
export type PeekMode = 'side' | 'center' | 'full'

const STORAGE_KEY = 'konku:peek-mode'

/** The preference, remembered across visits. */
export function usePeekMode(): [PeekMode, (m: PeekMode) => void] {
  const [mode, setStored] = useState<PeekMode>(() => read() ?? 'side')

  function set(next: PeekMode) {
    setStored(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing or a full quota. A forgotten preference is not worth
      // a broken click.
    }
  }

  return [mode, set]
}

function read(): PeekMode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'side' || raw === 'center' || raw === 'full' ? raw : null
  } catch {
    return null
  }
}

/**
 * A preview of one item, over the list it came from.
 *
 * The two modes are genuinely different components, not one styled twice:
 *
 * **Side** is deliberately *not* a modal. There is no overlay, no focus trap
 * and no scroll lock, so the list stays live underneath — clicking another row
 * swaps what the panel shows instead of dismissing it, which is the whole
 * reason to peek rather than navigate. Escape closes it, because a panel you
 * can only dismiss with the mouse is worse than no panel.
 *
 * **Center** covers the list, so it *is* a modal and gets Radix: focus trap,
 * focus restore, scroll lock, `aria-modal`.
 *
 * `full` never reaches this component — the caller navigates instead.
 */
export function PeekPanel({
  open,
  onOpenChange,
  mode,
  onModeChange,
  fullPageTo,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 'full' is handled by the caller; this component only sees side/center. */
  mode: Exclude<PeekMode, 'full'>
  onModeChange: (m: PeekMode) => void
  /** Where "open as a page" goes. */
  fullPageTo: string
  title: string
  children: ReactNode
}) {
  // Side peek is not a Radix dialog, so Escape is ours to handle.
  useEffect(() => {
    if (!open || mode !== 'side') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, mode, onOpenChange])

  if (!open) return null

  const header = (
    <PeekHeader
      mode={mode}
      onModeChange={onModeChange}
      fullPageTo={fullPageTo}
      onClose={() => onOpenChange(false)}
    />
  )

  if (mode === 'side') {
    return (
      <aside
        aria-label={title}
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col',
          'border-l border-border bg-card text-card-fg shadow-dialog',
          'animate-slide-in-right',
        )}
      >
        {header}
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </aside>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl',
            '-translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-xl border border-border bg-card text-card-fg shadow-dialog',
            'data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-out',
          )}
        >
          {/* Radix requires a title for the dialog to be announced. It is
              visually redundant with the item's own heading below, so it is
              hidden rather than duplicated on screen. */}
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {header}
          <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}

function PeekHeader({
  mode,
  onModeChange,
  fullPageTo,
  onClose,
}: {
  mode: Exclude<PeekMode, 'full'>
  onModeChange: (m: PeekMode) => void
  fullPageTo: string
  onClose: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
      <PeekButton
        active={mode === 'side'}
        label="Tampilkan di samping"
        onClick={() => onModeChange('side')}
      >
        <PanelRight className="size-4" />
      </PeekButton>
      <PeekButton
        active={mode === 'center'}
        label="Tampilkan di tengah"
        onClick={() => onModeChange('center')}
      >
        <Maximize2 className="size-4" />
      </PeekButton>

      <Link
        to={fullPageTo}
        aria-label="Buka satu halaman penuh"
        title="Buka satu halaman penuh"
        className="rounded-md p-1.5 text-subtle-fg transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted hover:text-surface-fg"
      >
        <SquareArrowOutUpRight className="size-4" />
      </Link>

      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup pratinjau"
        title="Tutup pratinjau"
        className="ml-auto rounded-md p-1.5 text-subtle-fg transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted hover:text-surface-fg"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

function PeekButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-md p-1.5 transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
        active
          ? 'bg-accent text-accent-fg'
          : 'text-subtle-fg hover:bg-muted hover:text-surface-fg',
      )}
    >
      {children}
    </button>
  )
}
