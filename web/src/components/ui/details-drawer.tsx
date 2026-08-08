import * as DialogPrimitive from '@radix-ui/react-dialog'
import { PanelRight, X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { DialogOverlay, DialogPortal } from './dialog'

/**
 * The metadata panel beside a note or a card — domain, categories, dates.
 *
 * Two behaviours in one component on purpose. On a wide screen it is a static
 * column that sits next to the content and never traps focus, because it is
 * not a modal: you edit the note and set its domain without a mode change. On
 * a narrow screen there is no room for a column, so the same content becomes a
 * real Radix dialog — focus trap, Escape, scroll lock — since it then covers
 * what you were reading.
 *
 * Rendering both and hiding one with CSS would put the panel's fields in the
 * DOM twice, which duplicates every input's id and breaks label association.
 * The caller decides which by passing `docked`.
 */
export function DetailsDrawer({
  open,
  onOpenChange,
  docked,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** True when there is room for a column — the caller's breakpoint call. */
  docked: boolean
  title: string
  children: ReactNode
}) {
  if (docked) {
    if (!open) return null
    return (
      <aside
        aria-label={title}
        className="w-72 shrink-0 border-l border-border bg-card"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-card-fg">{title}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Tutup panel"
            className="rounded-sm text-subtle-fg transition-colors hover:text-surface-fg"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-5 px-4 py-4">{children}</div>
      </aside>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col',
            'border-l border-border bg-card text-card-fg shadow-dialog',
            'data-[state=open]:animate-slide-in-right data-[state=closed]:animate-fade-out',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-medium text-card-fg">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Tutup panel"
              className="rounded-sm text-subtle-fg transition-colors hover:text-surface-fg"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}

/** The button that opens it. */
export function DetailsDrawerTrigger({
  className,
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label="Detail"
      title="Detail"
      className={cn(
        'rounded-md p-1.5 text-subtle-fg transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted hover:text-surface-fg',
        className,
      )}
      {...props}
    >
      <PanelRight className="size-4" />
    </button>
  )
}

/** One labelled row inside the panel. */
export function DetailsField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-subtle-fg">{label}</span>
      {children}
    </div>
  )
}
