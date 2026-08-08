import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Notice } from '../../components/ui/notice'
import { Loading } from '../../components/ui/spinner'
import { Textarea } from '../../components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
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
  // Side by side does not fit next to the note list, so the preview is a mode.
  const [preview, setPreview] = useState(false)

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

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  const cards = countCards(content)

  return (
    <Card className="flex min-h-96 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
        <Button asChild variant="link" size="inline" className="md:hidden">
          <Link to="/notes">
            <ArrowLeft />
            Catatan
          </Link>
        </Button>

        <ToggleGroup>
          <ToggleGroupItem selected={!preview} onClick={() => setPreview(false)}>
            Tulis
          </ToggleGroupItem>
          <ToggleGroupItem selected={preview} onClick={() => setPreview(true)}>
            Pratinjau
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="ml-auto flex items-center gap-3">
          <SaveStatus dirty={dirty} pending={save.isPending} failed={save.isError} />
          <Button
            variant="primary"
            size="sm"
            onClick={doSave}
            disabled={!dirty || save.isPending}
          >
            Simpan
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-5 md:px-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Judul"
          className="w-full text-xl font-semibold text-card-fg placeholder:text-subtle-fg focus-visible:outline-none"
        />

        {preview ? (
          <div className="min-h-96 flex-1">
            {content.trim() ? (
              renderMarkdown(content)
            ) : (
              <p className="text-sm text-subtle-fg">Pratinjau muncul di sini.</p>
            )}
          </div>
        ) : (
          <Textarea
            ref={textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            placeholder="Tulis di sini…"
            className="min-h-96 flex-1 border-0 bg-transparent p-0 font-mono text-sm leading-relaxed"
          />
        )}

        {/* The syntax is the one thing a new user has to be told. */}
        <p className="text-xs text-subtle-fg">
          Tulis kartu dengan format{' '}
          <code className="rounded-sm bg-muted px-1 font-mono">Tanya :: Jawab</code>
          {cards > 0 && ` · ${cards} kartu di catatan ini`}
        </p>
      </div>
    </Card>
  )
}

function SaveStatus({ dirty, pending, failed }: { dirty: boolean; pending: boolean; failed: boolean }) {
  if (failed) {
    // Not alarming, and not a dead end: the text is still in the box and the
    // next keystroke schedules another attempt.
    return <span className="text-sm text-muted-fg">Belum tersimpan, mencoba lagi…</span>
  }
  if (pending) return <span className="text-sm text-subtle-fg">Menyimpan…</span>
  if (dirty) return <span className="text-sm text-subtle-fg">Belum tersimpan</span>
  return <span className="text-sm text-subtle-fg">Tersimpan</span>
}
