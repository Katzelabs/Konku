import { useEffect, useRef, useState } from 'react'
import type { DomainId } from '../../api/types'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Notice } from '../../components/ui/notice'
import { Textarea } from '../../components/ui/textarea'
import { useCopy } from '../../i18n'
import { useCreateNote } from '../notes/queries'

/**
 * The capture prompt at the end of a focus session.
 *
 * This is why the timer is in the MVP at all (D-038). The MVP exists to find
 * out whether notes and cards actually get written, and asking at the moment
 * the session ends — rather than leaving it to a later act of discipline — is
 * the strongest mechanism in the design for making that automatic (D-011).
 *
 * So: one field, already focused, and skipping costs nothing. No "are you
 * sure", no second screen, no nagging. A skipped session is a normal session.
 *
 * Now on Radix, which brings the focus trap, focus restore and scroll lock the
 * hand-rolled version never had. Escape and outside-click still just close,
 * because closing is a skip and a skip needs no confirmation.
 */
export default function CaptureDialog({
  domainId,
  onClose,
}: {
  domainId: DomainId | null
  onClose: () => void
}) {
  const c = useCopy().timer.capture
  const [text, setText] = useState('')
  const create = useCreateNote()
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    field.current?.focus()
  }, [])

  function save() {
    const contentMd = text.trim()
    if (!contentMd) {
      onClose()
      return
    }
    // The title is left to the server, which takes it from the first line.
    // Being made to name a thought before writing it down is exactly the
    // friction this prompt exists to remove.
    create.mutate({ contentMd: contentMd + '\n', domainId }, { onSuccess: onClose })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showClose={false}>
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{c.description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-2">
          <Textarea
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // i18n-exempt: 'Enter' is a KeyboardEvent.key value, not copy.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
            }}
            rows={4}
            placeholder={c.placeholder}
          />

          <p className="text-xs text-subtle-fg">
            {c.cardHint}{' '}
            <code className="rounded-sm bg-muted px-1 font-mono">{c.cardSyntax}</code>
          </p>

          {create.isError && <Notice>{create.error.message}</Notice>}
        </DialogBody>

        <DialogFooter>
          {/*
            Skipping is a plain, equal option — same weight as saving, no
            greying out, no guilt copy. Nothing was lost by not writing.
          */}
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {c.skip}
          </Button>
          <Button variant="primary" onClick={save} disabled={create.isPending}>
            {create.isPending ? c.saving : c.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
