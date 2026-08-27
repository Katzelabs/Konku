import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCopy } from '../../i18n'
import { cn } from '../../lib/utils'
import { DialogOverlay, DialogPortal } from './dialog'

/**
 * How the open item is shown.
 *
 * It is no longer a preference. It used to be one — side, center or full page,
 * remembered in localStorage and switched from a row of buttons on the panel
 * itself — which meant two controls on one screen deciding the same thing: the
 * view toggle chose how the *list* looked and this chose how the *item* looked,
 * and every combination of the two had to work.
 *
 * The view toggle answers both now. A list is narrow and leaves room beside it,
 * so it gets `side`. A grid uses the whole width and has no room beside it, so
 * it gets `center`. Nothing is stored, nothing is chosen twice, and the panel
 * lost the button row that used to sit above every previewed note.
 */
export type PeekMode = 'side' | 'center'

/**
 * A preview of one item from the list it came from.
 *
 * The two modes are genuinely different components, not one styled twice:
 *
 * **Side** is deliberately *not* a modal and does not float. It is a card the
 * page puts in its second column, so the list stays live beside it — clicking
 * another row swaps what the card shows instead of dismissing it, which is the
 * whole reason to peek rather than navigate.
 *
 * It has no close button and no Escape handler, and that is a consequence of
 * auto-selection rather than an omission. List view opens its top row on
 * arrival, so there is no "nothing selected" state to close *to*: closing
 * would immediately re-select, and the Escape handler this used to have was
 * worse than that — it called `navigate(-1)` against a history entry that
 * auto-selection had already replaced, so pressing Escape on the note list
 * left the note list. Switching to grid is what closes the preview.
 *
 * **Center** covers the list, so it *is* a modal and gets Radix: focus trap,
 * focus restore, scroll lock, `aria-modal`, Escape and outside-dismissal. It
 * portals out of wherever it is mounted, which is what lets both modes be
 * rendered from the same place in the page.
 */
export function PeekPanel({
  open,
  onOpenChange,
  mode,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: PeekMode
  title: string
  children: ReactNode
}) {
  const c = useCopy()

  if (!open) return null

  if (mode === 'side') {
    return (
      <section
        aria-label={title}
        className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-fg"
      >
        {/*
          No scroll container of its own: the column around it is the one that
          scrolls (ListDetail), so a second one here would produce the nested
          scrollbars that make a long note impossible to read.
        */}
        <div className="px-5 py-5 md:px-6">{children}</div>
      </section>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl',
            '-translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-xl border border-border bg-card text-card-fg shadow-dialog',
            'data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-out',
          )}
        >
          {/* Radix requires a title for the dialog to be announced. It is
              visually redundant with the item's own heading below, so it is
              hidden rather than duplicated on screen. */}
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

          {/*
            The one control the panel keeps. A modal covers what it came from,
            so it has to say how to get back — unlike the side pane, which is
            beside the list rather than on top of it.
          */}
          <DialogPrimitive.Close
            aria-label={c.common.peek.close}
            className="absolute top-3 right-3 rounded-md p-1.5 text-subtle-fg transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted hover:text-surface-fg"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>

          {/*
            Extra room on the right, because the close button floats over this
            and the first thing a preview renders is a metadata row that ends
            in a date at `ml-auto`. Without it the × lands on top of "Hari ini".
          */}
          <div className="flex-1 overflow-y-auto px-6 py-6 pr-14">{children}</div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}
