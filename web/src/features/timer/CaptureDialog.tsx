import { useEffect, useRef, useState } from 'react'
import type { DomainId } from '../../api/types'
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
 */
export default function CaptureDialog({
  domainId,
  onClose,
}: {
  domainId: DomainId | null
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const create = useCreateNote()
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    field.current?.focus()
  }, [])

  useEffect(() => {
    // Escape simply closes. It is a skip, and a skip needs no confirmation.
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-slate-900/20 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Apa yang kamu pelajari?"
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-lg"
      >
        <h2 className="text-lg font-medium text-slate-900">Apa yang kamu pelajari?</h2>

        <textarea
          ref={field}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
          }}
          rows={4}
          placeholder="Satu baris saja cukup."
          className="mt-3 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm leading-relaxed focus:border-slate-400"
        />

        <p className="mt-2 text-xs text-slate-500">
          Tulis kartu dengan format <code className="rounded-sm bg-slate-100 px-1">Tanya :: Jawab</code>
        </p>

        {create.isError && (
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {create.error.message}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          {/*
            "Lewati" is a plain, equal option — same weight as saving, no
            greying out, no guilt copy. Nothing was lost by not writing.
          */}
          <button
            onClick={onClose}
            disabled={create.isPending}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600"
          >
            Lewati
          </button>
          <button
            onClick={save}
            disabled={create.isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {create.isPending ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}
