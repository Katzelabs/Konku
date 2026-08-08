import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { DomainDot } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import { CategoryPicker } from '../../components/ui/category'
import {
  DetailsDrawer,
  DetailsDrawerTrigger,
  DetailsField,
} from '../../components/ui/details-drawer'
import { Markdown } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import { Loading } from '../../components/ui/spinner'
import { Textarea } from '../../components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useMediaQuery } from '../../lib/use-media-query'
import { useCategories, useCreateCategory } from '../categories/queries'
import { useDomains } from '../domains/queries'
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
  const [domainId, setDomainId] = useState<string | null>(null)
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  // The editor is full width now, so write and preview fit side by side. It
  // was a mode only because the note list occupied half the screen.
  const [mode, setMode] = useState<'write' | 'split' | 'preview'>('split')
  const [detailsOpen, setDetailsOpen] = useState(false)

  const wide = useMediaQuery('(min-width: 1024px)')

  const { data: domains } = useDomains()
  const { data: categories } = useCategories()
  const createCategory = useCreateCategory()

  // What the server currently holds, so "dirty" is a fact rather than a guess.
  const saved = useRef({ title: '', content: '', domainId: null as string | null, categoryIds: [] as string[] })

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
    const submitted = { title, contentMd: content, domainId, categoryIds }
    save.mutate(submitted, {
      onSuccess: (fresh) => {
        // Straight adoption. This used to have to reconcile the response
        // against live keystrokes and remap the caret, because the parser
        // rewrote the markdown to insert card IDs. Nothing rewrites a note now
        // (D-055), so the response is what was sent and there is nothing to
        // merge.
        saved.current = {
          title: fresh.title,
          content: fresh.contentMd,
          domainId: fresh.domainId,
          categoryIds: fresh.categoryIds,
        }
      },
    })
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
      if (latest.current.dirty) latest.current.doSave()
    },
    [],
  )

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  const showWrite = mode !== 'preview'
  const showPreview = mode !== 'write'

  return (
    <div className="flex gap-0">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
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
            <DetailsDrawerTrigger onClick={() => setDetailsOpen((v) => !v)} />
          </div>
        </div>

        <Card className="flex min-h-[32rem] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
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
              <ToggleGroupItem selected={mode === 'preview'} onClick={() => setMode('preview')}>
                Pratinjau
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-1 flex-col gap-4 px-4 py-5 md:px-5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul"
              className="w-full text-2xl font-semibold text-card-fg placeholder:text-subtle-fg focus-visible:outline-none"
            />

            <div
              className={
                mode === 'split'
                  ? 'grid flex-1 gap-6 lg:grid-cols-2'
                  : 'flex flex-1 flex-col'
              }
            >
              {showWrite && (
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                  placeholder="Tulis di sini…"
                  className="min-h-[26rem] flex-1 resize-none border-0 bg-transparent p-0 font-mono text-sm leading-relaxed"
                />
              )}

              {showPreview && (
                <div className="min-h-[26rem] flex-1 lg:border-l lg:border-border lg:pl-6">
                  {content.trim() ? (
                    <Markdown>{content}</Markdown>
                  ) : (
                    <p className="text-sm text-subtle-fg">Pratinjau muncul di sini.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <DetailsDrawer
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        docked={wide}
        title="Detail"
      >
        {/*
          The domain picker lives here, and until now it did not exist at all:
          the API has accepted domainId since A1 and no screen ever sent it, so
          every note in the database was untagged and the domain filter had
          nothing to filter.
        */}
        <DetailsField label="Domain">
          <div className="flex flex-wrap gap-2">
            <ToggleGroupItem selected={domainId === null} onClick={() => setDomainId(null)}>
              Tanpa domain
            </ToggleGroupItem>
            {(domains ?? []).map((d) => (
              <ToggleGroupItem
                key={d.id}
                selected={domainId === d.id}
                onClick={() => setDomainId(d.id)}
                className="inline-flex items-center gap-1.5"
              >
                <DomainDot color={d.color} />
                {d.label}
              </ToggleGroupItem>
            ))}
          </div>
        </DetailsField>

        <DetailsField label="Kategori">
          <CategoryPicker
            categories={categories ?? []}
            selected={categoryIds}
            creating={createCategory.isPending}
            onChange={setCategoryIds}
            onCreate={(label) => createCategory.mutateAsync(label).catch(() => null)}
          />
        </DetailsField>

        {note && (
          <DetailsField label="Diperbarui">
            <span className="text-sm text-muted-fg">
              {new Date(note.updatedAt).toLocaleString('id-ID')}
            </span>
          </DetailsField>
        )}
      </DetailsDrawer>
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
