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
import { useCategories, useCreateCategory } from '../categories/queries'
import { useDomains } from '../domains/queries'
import { useDeleteNote, useNote, useSaveNote } from './queries'

/**
 * Long enough not to fire between words, short enough that leaving the page
 * almost never loses anything. There is an explicit save too — autosave is
 * there so that forgetting to press it costs nothing, not to replace it.
 */
const AUTOSAVE_MS = 1500

export default function NoteEditorPage() {
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

  const doSave = useCallback(() => {
    save.mutate(
      { title, contentMd: content, domainId, categoryIds },
      {
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
        },
      },
    )
  }, [title, content, domainId, categoryIds, save])

  // doSave is rebuilt on every render, so the debounce reads it through a ref
  // rather than depending on it. Depending on it directly would restart the
  // countdown on *any* re-render, and a note edited while something else keeps
  // re-rendering would never autosave at all.
  const latest = useRef({ dirty, doSave })
  latest.current = { dirty, doSave }

  // The debounce: every change restarts the clock, nothing else does.
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => latest.current.doSave(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [dirty, title, content, domainId, categoryIds])

  // Leaving mid-edit saves rather than warning. "Are you sure you want to
  // discard?" is a guilt prompt for something the app can simply handle.
  useEffect(
    () => () => {
      if (removed.current) return
      if (latest.current.dirty) latest.current.doSave()
    },
    [],
  )

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
            Catatan
          </Link>
        </Button>

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
            <PropertyRow icon={<Folder className="size-3.5" />} label="Domain">
              <DomainProperty domains={domains} value={domainId} onChange={setDomainId} />
            </PropertyRow>
            <PropertyRow icon={<Tag className="size-3.5" />} label="Kategori">
              <CategoryProperty
                categories={categories}
                selected={categoryIds}
                creating={createCategory.isPending}
                onChange={setCategoryIds}
                onCreate={(label) => createCategory.mutateAsync(label).catch(() => null)}
              />
            </PropertyRow>
          </PropertyBar>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul"
            className="w-full text-3xl font-bold tracking-tight text-card-fg placeholder:text-subtle-fg focus-visible:outline-none"
          />
        </div>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-8">
          <ToggleGroup>
            <ToggleGroupItem selected={mode === 'write'} onClick={() => setMode('write')}>
              Tulis
            </ToggleGroupItem>
            {/* Side by side only where there is room for two columns. */}
            <ToggleGroupItem
              selected={mode === 'split'}
              onClick={() => setMode('split')}
              className="hidden lg:inline-flex"
            >
              Terpisah
            </ToggleGroupItem>
            <ToggleGroupItem
              selected={mode === 'preview'}
              onClick={() => setMode('preview')}
            >
              Pratinjau
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
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              placeholder="Tulis di sini…"
              className="min-h-[34rem] flex-1 font-mono text-sm"
            />
          )}

          {showPreview && (
            <div className="min-h-[34rem] flex-1 lg:border-l lg:border-border lg:pl-6">
              {content.trim() ? (
                <Markdown>{content}</Markdown>
              ) : (
                <p className="text-sm text-subtle-fg">Pratinjau muncul di sini.</p>
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
          Hapus catatan
        </Button>

        {remove.isError && <Notice>{remove.error.message}</Notice>}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Hapus catatan ini?"
        description="Catatan pindah ke Terhapus beserta kategorinya, dan bisa dikembalikan kapan saja."
        confirmLabel="Hapus"
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

function SaveStatus({
  dirty,
  pending,
  failed,
}: {
  dirty: boolean
  pending: boolean
  failed: boolean
}) {
  if (failed) {
    // Not alarming, and not a dead end: the text is still in the box and the
    // next keystroke schedules another attempt.
    return <span className="text-sm text-muted-fg">Belum tersimpan, mencoba lagi…</span>
  }
  if (pending) return <span className="text-sm text-subtle-fg">Menyimpan…</span>
  if (dirty) return <span className="text-sm text-subtle-fg">Belum tersimpan</span>
  return <span className="text-sm text-subtle-fg">Tersimpan</span>
}
