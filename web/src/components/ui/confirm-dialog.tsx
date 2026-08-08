import type { ReactNode } from 'react'
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
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  /** Keeps the dialog up and the button disabled while the request is in flight. */
  pending?: boolean
  onConfirm: () => void
}) {
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
            Batal
          </Button>
          {/*
            The only destructive control in this dialog, and the reason the
            variant exists: it removes data. Cancel stays neutral so the pair
            does not read as a threat (D-054).
          */}
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? 'Menghapus…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
