import type { ReactNode } from 'react'
import { useCopy } from '../../i18n'
import { Button } from './button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'

/**
 * "Are you sure?" for an action that removes data.
 *
 * Radix Dialog, so the focus trap, focus restore, scroll lock and Escape are
 * the vetted ones rather than three near-identical hand-rolled versions across
 * the note list, the card list and the editors.
 *
 * The copy states what will happen and how to get it back. Deleting here is a
 * soft delete on both resources, so the honest description is "it moves to
 * Terhapus", not a warning about permanence — an alarming prompt for a
 * reversible action is the punitive tone hard rule 6 rules out, and it also
 * trains people to click through prompts that do matter.
 *
 * The in-flight word used to be `'Menghapus…'`, baked in beside a `confirmLabel`
 * the caller chooses freely — so the dialog asserted the action was a delete
 * whatever the button next to it said. It is `pendingLabel` now, and it falls
 * back to `common.working` rather than to a verb: a generic dialog says a
 * generic thing, and a caller that knows the verb passes it (ticket 11 I5).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  /**
   * What the confirm button says while the request is in flight. Defaults to
   * `common.working`, which is true of any action and claims nothing about
   * which one this is.
   */
  pendingLabel?: string
  /** Keeps the dialog up and the button disabled while the request is in flight. */
  pending?: boolean
  onConfirm: () => void
}) {
  const c = useCopy().common

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Body kept for the dialog's own spacing rhythm even when empty. */}
        <DialogBody />

        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {c.cancel}
          </Button>
          {/*
            The only destructive control in this dialog, and the reason the
            variant exists: it removes data. Cancel stays neutral so the pair
            does not read as a threat (D-054).
          */}
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? (pendingLabel ?? c.working) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
