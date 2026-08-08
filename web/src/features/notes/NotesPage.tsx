import { useMemo } from 'react'
import { Plus, Search } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Category, Domain, NoteSummary } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { CategoryChips } from '../../components/ui/category'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { Loading } from '../../components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useViewMode, ViewToggle } from '../../components/ui/view-toggle'
import { humanDay } from '../../lib/date'
import { cn } from '../../lib/utils'
import { useAllCategories } from '../categories/queries'
import { useDomains } from '../domains/queries'
import { useCreateNote, useNotes } from './queries'

/**
 * The note index.
 *
 * It used to be a two-pane layout with the editor mounted in an `<Outlet>`.
 * The editor is its own full-width route now, which is what lets it show write
 * and preview side by side instead of as a mode — the pane was the constraint,
 * not the design.
 */
export default function NotesPage() {
  const navigate = useNavigate()
  const [view, setView] = useViewMode('konku:notes-view')

  // The query lives in the URL so the top bar's search box and this one are
  // the same filter rather than two that disagree.
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const categoryId = params.get('categoryId')

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true, preventScrollReset: true })
  }

  const { data: notes, isPending, error } = useNotes({ categoryId })
  const { data: domains } = useDomains()
  const { data: categories } = useAllCategories()
  const create = useCreateNote()

  function newNote() {
    create.mutate({ contentMd: '' }, { onSuccess: (n) => navigate(`/notes/${n.id}`) })
  }

  // A client-side filter over the list already in memory, not search. Ranked
  // full-text search stays deferred to v0.2 (D-031), so the placeholder says
  // "judul" and does not promise more than it does.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes ?? []
    return (notes ?? []).filter((n) => n.title.toLowerCase().includes(q))
  }, [notes, query])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catatan"
        description="Tulis dulu, rapikan nanti."
        meta={!isPending && <span>{notes?.length ?? 0} catatan</span>}
        actions={
          <Button variant="primary" onClick={newNote} disabled={create.isPending}>
            <Plus />
            {create.isPending ? 'Sebentar…' : 'Catatan baru'}
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-fg" />
            <Input
              value={query}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Cari judul…"
              className="pl-9"
            />
          </div>
          <ViewToggle mode={view} onChange={setView} />
        </div>

        {categories && categories.length > 0 && (
          <ToggleGroup>
            <ToggleGroupItem
              selected={categoryId === null}
              onClick={() => setParam('categoryId', null)}
            >
              Semua
            </ToggleGroupItem>
            {categories.map((c) => (
              <ToggleGroupItem
                key={c.id}
                selected={categoryId === c.id}
                onClick={() => setParam('categoryId', c.id)}
              >
                {c.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {isPending && <Loading />}
      {error && <Notice>{error.message}</Notice>}
      {create.isError && <Notice>{create.error.message}</Notice>}

      {notes && notes.length === 0 && (
        /*
         * An empty library is a starting point, not a failure. No sad-box
         * illustration and no "you haven't written anything yet" — the copy
         * says what to do next and makes it small (GOALS.md).
         */
        <EmptyState
          title="Belum ada catatan."
          description="Mulai dari satu baris saja."
        />
      )}

      {notes && notes.length > 0 && filtered.length === 0 && (
        <p className="px-1 py-4 text-sm text-muted-fg">
          Tidak ada judul yang cocok.
        </p>
      )}

      {filtered.length > 0 &&
        (view === 'grid' ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((note) => (
              <li key={note.id}>
                <NoteTile note={note} domains={domains} categories={categories} />
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {filtered.map((note) => (
                <li key={note.id}>
                  <NoteRow note={note} domains={domains} categories={categories} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
    </div>
  )
}

function useNoteMeta(note: NoteSummary, domains: Domain[] | undefined) {
  return domains?.find((d) => d.id === note.domainId)
}

function NoteRow({
  note,
  domains,
  categories,
}: {
  note: NoteSummary
  domains: Domain[] | undefined
  categories: Category[] | undefined
}) {
  const domain = useNoteMeta(note, domains)

  return (
    <Link
      to={`/notes/${note.id}`}
      className="flex flex-col gap-1.5 px-4 py-3 transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium text-card-fg">
          {note.title || 'Tanpa judul'}
        </span>
        <span className="shrink-0 text-xs text-subtle-fg">
          {humanDay(note.updatedAt)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {domain && (
          <span className="flex min-w-0 items-center gap-1.5">
            <DomainDot color={domain.color} />
            <span className="truncate text-xs text-muted-fg">{domain.label}</span>
          </span>
        )}
        <CategoryChips ids={note.categoryIds} categories={categories} />
      </div>
    </Link>
  )
}

function NoteTile({
  note,
  domains,
  categories,
}: {
  note: NoteSummary
  domains: Domain[] | undefined
  categories: Category[] | undefined
}) {
  const domain = useNoteMeta(note, domains)

  return (
    <Link
      to={`/notes/${note.id}`}
      className={cn(
        'flex h-full flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3',
        'transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        {domain ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <DomainDot color={domain.color} />
            <span className="truncate text-xs text-muted-fg">{domain.label}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="shrink-0 text-xs text-subtle-fg">
          {humanDay(note.updatedAt)}
        </span>
      </div>

      <span className="line-clamp-2 text-sm font-medium text-card-fg">
        {note.title || 'Tanpa judul'}
      </span>

      <CategoryChips
        ids={note.categoryIds}
        categories={categories}
        className="mt-auto pt-1"
      />
    </Link>
  )
}
