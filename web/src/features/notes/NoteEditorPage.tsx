import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Folder, Tag, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Markdown } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import {
  CategoryProperty,
  DomainProperty,
  PropertyBar,
  PropertyRow,
} from '../../components/ui/property'
import { Loading } from '../../components/ui/spinner'
import { Textarea } from '../../components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useCopy, type Copy } from '../../i18n'
import { useFlushOnHide } from '../../lib/useFlushOnHide'
import { useCategories, useCreateCategory } from '../categories/queries'
import { useDomains } from '../domains/queries'
import type { NoteInput } from './queries'
import { RECOVERY_DAYS, useDeleteNote, useNote, useSaveNote } from './queries'

/**
 * Long enough not to fire between words, short enough that leaving the page
 * almost never loses anything. There is an explicit save too — autosave is
 * there so that forgetting to press it costs nothing, not to replace it.
 */
const AUTOSAVE_MS = 1500

/**
 * Backoff between attempts after a save fails. The last delay repeats, and
 * there is no attempt limit: until a save lands, the only copy of the text is
 * in this tab, so "give up retrying" and "lose the note" are the same thing.
 */
const RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000]

export default function NoteEditorPage() {
  const c = useCopy().notes
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: note, isPending, error } = useNote(id)
  const save = useSaveNote(id)
  const remove = useDeleteNote()

  const [confirming, setConfirming] = useState(false)
  // Set the moment a delete succeeds, so the save-on-unmount below does not
  // fire a PATCH at a note that has just gone. The server would refuse it —
  // UpdateNote requires deleted_at IS NULL, so an edit can never resurrect a
  // deleted note — but a request that exists only to be rejected, and a
  // "Belum tersimpan, mencoba lagi…" flashing up as the screen leaves, is
  // noise the user should not have to interpret.
  const removed = useRef(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [domainId, setDomainId] = useState<string | null>(null)
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  // How many times the current failure has been retried, which is also the
  // index into RETRY_MS. Reset by a save that succeeds.
  const [attempt, setAttempt] = useState(0)

  // The editor is full width now, so write and preview fit side by side. It
  // was a mode only because the note list occupied half the screen.
  const [mode, setMode] = useState<'write' | 'split' | 'preview'>('split')

  const { data: domains } = useDomains()
  const { data: categories } = useCategories()
  const createCategory = useCreateCategory()

  // What the server currently holds, so "dirty" is a fact rather than a guess.
  const saved = useRef({
    title: '',
    content: '',
    domainId: null as string | null,
    categoryIds: [] as string[],
  })

  useEffect(() => {
    if (!note || loaded) return
    setTitle(note.title)
    setContent(note.contentMd)
    setDomainId(note.domainId)
    setCategoryIds(note.categoryIds)
    saved.current = {
      title: note.title,
      content: note.contentMd,
      domainId: note.domainId,
      categoryIds: note.categoryIds,
    }
    setLoaded(true)
  }, [note, loaded])

  const dirty =
    loaded &&
    (title !== saved.current.title ||
      content !== saved.current.content ||
      domainId !== saved.current.domainId ||
      !sameIds(categoryIds, saved.current.categoryIds))

  // What a save would send right now. Held in one place so the retry, the
  // unmount save and the keepalive flush cannot drift apart from each other.
  const input: NoteInput = { title, contentMd: content, domainId, categoryIds }

  const doSave = useCallback(() => {
    save.mutate(input, {
      onSuccess: (fresh) => {
        // Straight adoption. This used to reconcile the response against
        // live keystrokes and remap the caret, because the parser rewrote
        // the markdown to insert card IDs. Nothing rewrites a note now
        // (D-055), so the response is what was sent.
        saved.current = {
          title: fresh.title,
          content: fresh.contentMd,
          domainId: fresh.domainId,
          categoryIds: fresh.categoryIds,
        }
        setAttempt(0)
      },
    })
    // The four fields rather than `input`, which is a fresh object on every
    // render: these are what it is built from, so the list is exact.
  }, [title, content, domainId, categoryIds, save])

  // doSave is rebuilt on every render, so the debounce reads it through a ref
  // rather than depending on it. Depending on it directly would restart the
  // countdown on *any* re-render, and a note edited while something else keeps
  // re-rendering would never autosave at all.
  const latest = useRef({ dirty, doSave, input })
  latest.current = { dirty, doSave, input }

  // The debounce: every change restarts the clock, nothing else does.
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => latest.current.doSave(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [dirty, title, content, domainId, categoryIds])

  /*
   * The retry the status line has always claimed to be making.
   *
   * The debounce above cannot do it. A failed save leaves `saved.current`
   * untouched, so `dirty` is still true and title, content, domainId and
   * categoryIds are all the same values they were — every dependency is
   * unchanged, and the effect does not re-run. TanStack does not cover it
   * either: mutations default to zero retries. So the only thing that ever
   * tried again was the next keystroke, which is precisely what stops when
   * someone finishes writing and shuts the laptop.
   *
   * Retrying through doSave rather than through TanStack's `retry` option is
   * deliberate. `retry` re-sends the payload captured when mutate was called,
   * so an attempt that lands after further typing would overwrite the newer
   * text with the older text — a data-loss bug inside the fix for a data-loss
   * bug. doSave always sends what is on screen now.
   */
  useEffect(() => {
    if (!save.isError || !dirty) return
    const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]
    const timer = setTimeout(() => {
      // Re-checked rather than trusted: the online listener below may have
      // got there first while this timer was pending.
      if (!latest.current.dirty) return
      setAttempt((n) => n + 1)
      latest.current.doSave()
    }, delay)
    return () => clearTimeout(timer)
  }, [save.isError, dirty, attempt])

  // Coming back online is better evidence than any timer, so it jumps the
  // backoff instead of waiting it out.
  useEffect(() => {
    const retryNow = () => {
      if (latest.current.dirty) latest.current.doSave()
    }
    window.addEventListener('online', retryNow)
    return () => window.removeEventListener('online', retryNow)
  }, [])

  // Leaving mid-edit saves rather than warning. "Are you sure you want to
  // discard?" is a guilt prompt for something the app can simply handle.
  //
  // This is a React cleanup, so it covers SPA navigation and nothing else: not
  // a tab close, not a reload, not a link off the origin. useFlushOnHide below
  // is the second mechanism that covers those (hard rule 9).
  useEffect(
    () => () => {
      if (removed.current) return
      if (latest.current.dirty) latest.current.doSave()
    },
    [],
  )

  useFlushOnHide({
    onHidden: () => {
      if (removed.current || !latest.current.dirty) return
      latest.current.doSave()
    },
    // Idempotent, as that path requires: a PATCH at a note that already exists
    // writes the same row whether it arrives once or twice.
    pending: () =>
      removed.current || !latest.current.dirty
        ? null
        : { path: `/notes/${id}`, method: 'PATCH', body: latest.current.input },
  })

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  const showWrite = mode !== 'preview'
  const showPreview = mode !== 'write'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="link" size="inline">
          <Link to="/notes">
            <ArrowLeft />
            {c.editor.back}
          </Link>
        </Button>

        <div className="ml-auto flex items-center gap-3">
          <SaveStatus
            copy={c.editor.status}
            dirty={dirty}
            pending={save.isPending}
            failed={save.isError}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={doSave}
            disabled={!dirty || save.isPending}
          >
            {c.editor.save}
          </Button>
        </div>
      </div>

      <Card className="flex min-h-[42rem] flex-col">
        <div className="flex flex-col gap-4 px-4 pt-5 md:px-8">
          {/*
            Properties above the title, the way Notion puts them at the top of
            a page. They were in a right-hand drawer first, which made setting
            a domain a separate trip rather than part of writing the note.

            This is also where the domain picker finally exists at all: the API
            has accepted domainId since A1 and no screen ever sent it, so every
            note in the database was untagged.
          */}
          <PropertyBar>
            <PropertyRow icon={<Folder className="size-3.5" />} label={c.editor.domain}>
              <DomainProperty domains={domains} value={domainId} onChange={setDomainId} />
            </PropertyRow>
            <PropertyRow icon={<Tag className="size-3.5" />} label={c.editor.category}>
              <CategoryProperty
                categories={categories}
                selected={categoryIds}
                creating={createCategory.isPending}
                onChange={setCategoryIds}
                onCreate={(label) => createCategory.mutateAsync(label).catch(() => null)}
              />
            </PropertyRow>
          </PropertyBar>

          {/* A placeholder is not a label: it is gone the moment there is a
              title, which is most of the time this field is read (F-12). */}
          <input
            aria-label={c.editor.title.label}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={c.editor.title.placeholder}
            className="w-full text-3xl font-bold tracking-tight text-card-fg placeholder:text-subtle-fg focus-visible:outline-none"
          />
        </div>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-8">
          <ToggleGroup>
            <ToggleGroupItem selected={mode === 'write'} onClick={() => setMode('write')}>
              {c.editor.mode.write}
            </ToggleGroupItem>
            {/* Side by side only where there is room for two columns. */}
            <ToggleGroupItem
              selected={mode === 'split'}
              onClick={() => setMode('split')}
              className="hidden lg:inline-flex"
            >
              {c.editor.mode.split}
            </ToggleGroupItem>
            <ToggleGroupItem
              selected={mode === 'preview'}
              onClick={() => setMode('preview')}
            >
              {c.editor.mode.preview}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div
          className={
            mode === 'split'
              ? 'grid flex-1 gap-6 px-4 py-5 md:px-8 lg:grid-cols-2'
              : 'flex flex-1 flex-col px-4 py-5 md:px-8'
          }
        >
          {showWrite && (
            <Textarea
              variant="plain"
              aria-label={c.editor.body.label}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              placeholder={c.editor.body.placeholder}
              className="min-h-[34rem] flex-1 font-mono text-sm"
            />
          )}

          {showPreview && (
            <div className="min-h-[34rem] flex-1 lg:border-l lg:border-border lg:pl-6">
              {content.trim() ? (
                <Markdown>{content}</Markdown>
              ) : (
                <p className="text-sm text-subtle-fg">{c.editor.previewEmpty}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-col items-end gap-2">
        {/*
          A note could be written and edited but never removed until now, and
          the only delete in the API was a hard one nothing called. This is the
          soft one (00005): the note moves to Terhapus with its labels intact.

          The only destructive control on the screen, so the only one wearing
          the destructive variant (D-054), and it asks first — not because the
          delete is final, but because the note vanishes and the screen leaves.
        */}
        <Button
          variant="destructive"
          size="sm"
          disabled={remove.isPending}
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
          {c.editor.delete}
        </Button>

        {remove.isError && <Notice>{remove.error.message}</Notice>}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={c.delete.titleOne}
        description={c.delete.description(RECOVERY_DAYS)}
        confirmLabel={c.delete.action}
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              removed.current = true
              navigate('/notes')
            },
          })
        }
      />
    </div>
  )
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(b)
  return a.every((id) => set.has(id))
}

/**
 * Copy is passed in rather than read from `useCopy()` here, because this is a
 * pure display of the four states above it and the caller already holds the
 * catalog. `Copy` is the type to take at a boundary like this one; nothing
 * imports `id` directly to "just get a string".
 */
function SaveStatus({
  copy,
  dirty,
  pending,
  failed,
}: {
  copy: Copy['notes']['editor']['status']
  dirty: boolean
  pending: boolean
  failed: boolean
}) {
  if (failed) {
    // Not alarming, and not a dead end: the text is still in the box and
    // another attempt is already scheduled. This line used to be a promise the
    // code did not keep — the retry effect above is what makes it true, and it
    // is why the wording did not need softening.
    return <span className="text-sm text-muted-fg">{copy.retrying}</span>
  }
  if (pending) return <span className="text-sm text-subtle-fg">{copy.saving}</span>
  if (dirty) return <span className="text-sm text-subtle-fg">{copy.unsaved}</span>
  return <span className="text-sm text-subtle-fg">{copy.saved}</span>
}
