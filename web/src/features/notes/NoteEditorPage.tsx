import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { countCards } from '../../lib/cards'
import { remapCaret } from '../../lib/caret'
import { renderMarkdown } from '../../lib/markdown'
import { useNote, useSaveNote } from './queries'

/**
 * Long enough not to fire between words, short enough that leaving the page
 * almost never loses anything. There is an explicit save too — autosave is
 * there so that forgetting to press it costs nothing, not to replace it.
 */
const AUTOSAVE_MS = 1500

export default function NoteEditorPage() {
  const { id = '' } = useParams()
  const { data: note, isPending, error } = useNote(id)
  const save = useSaveNote(id)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState(false)

  // What the server currently holds, so "dirty" is a fact rather than a guess.
  const saved = useRef({ title: '', content: '' })
  const textarea = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<[number, number] | null>(null)

  useEffect(() => {
    if (!note || loaded) return
    setTitle(note.title)
    setContent(note.contentMd)
    saved.current = { title: note.title, content: note.contentMd }
    setLoaded(true)
  }, [note, loaded])

  const dirty = loaded && (title !== saved.current.title || content !== saved.current.content)

  const doSave = useCallback(() => {
    const submitted = { title, contentMd: content }
    save.mutate(submitted, {
      onSuccess: (fresh) => {
        saved.current = { title: fresh.title, content: fresh.contentMd }

        // Adopt the stored markdown so the IDs the parser assigned appear in
        // the editor — but only if the user has not typed since this save
        // left. Overwriting live keystrokes with a stale response is worse
        // than showing the IDs one save later.
        setContent((current) => {
          if (current !== submitted.contentMd || current === fresh.contentMd) return current
          const el = textarea.current
          if (el && document.activeElement === el) {
            pendingSelection.current = [
              remapCaret(current, fresh.contentMd, el.selectionStart),
              remapCaret(current, fresh.contentMd, el.selectionEnd),
            ]
          }
          return fresh.contentMd
        })
        setTitle((current) => (current === submitted.title ? fresh.title : current))
      },
    })
  }, [title, content, save])

  // Restore the caret after the swapped-in markdown has actually rendered.
  useLayoutEffect(() => {
    const selection = pendingSelection.current
    if (!selection || !textarea.current) return
    pendingSelection.current = null
    textarea.current.setSelectionRange(selection[0], selection[1])
  }, [content])

  // doSave is rebuilt on every render, so the debounce reads it through a ref
  // rather than depending on it. Depending on it directly would restart the
  // countdown on *any* re-render, and a note edited while something else keeps
  // re-rendering would never autosave at all.
  const latest = useRef({ dirty, doSave })
  latest.current = { dirty, doSave }

  // The debounce: every keystroke restarts the clock, nothing else does.
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => latest.current.doSave(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [dirty, title, content])

  // Leaving mid-edit saves rather than warning. "Are you sure you want to
  // discard?" is a guilt prompt for something the app can simply handle.
  useEffect(
    () => () => {
      if (latest.current.dirty) latest.current.doSave()
    },
    [],
  )

  if (isPending) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) {
    return <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{error.message}</p>
  }

  const cards = countCards(content)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Link to="/notes" className="text-sm text-slate-500 underline underline-offset-4">
          ← Catatan
        </Link>
        <div className="flex items-center gap-3">
          <SaveStatus dirty={dirty} pending={save.isPending} failed={save.isError} />
          <button
            onClick={doSave}
            disabled={!dirty || save.isPending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Simpan
          </button>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Judul"
        className="w-full text-xl font-semibold text-slate-900 placeholder:text-slate-300"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <textarea
            ref={textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            placeholder="Tulis di sini…"
            className="min-h-[24rem] w-full resize-y rounded-lg border border-slate-200 p-3 font-mono text-sm leading-relaxed focus:border-slate-400"
          />

          {/* The syntax is the one thing a new user has to be told. */}
          <p className="text-xs text-slate-500">
            Tulis kartu dengan format <code className="rounded-sm bg-slate-100 px-1">Tanya :: Jawab</code>
            {cards > 0 && ` · ${cards} kartu di catatan ini`}
          </p>
        </div>

        <div className="rounded-lg border border-slate-100 p-3">
          {content.trim() ? (
            renderMarkdown(content)
          ) : (
            <p className="text-sm text-slate-400">Pratinjau muncul di sini.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function SaveStatus({ dirty, pending, failed }: { dirty: boolean; pending: boolean; failed: boolean }) {
  if (failed) {
    // Not alarming, and not a dead end: the text is still in the box and the
    // next keystroke schedules another attempt.
    return <span className="text-sm text-slate-500">Belum tersimpan, mencoba lagi…</span>
  }
  if (pending) return <span className="text-sm text-slate-400">Menyimpan…</span>
  if (dirty) return <span className="text-sm text-slate-400">Belum tersimpan</span>
  return <span className="text-sm text-slate-400">Tersimpan</span>
}
