import { useMemo } from 'react'
import { Plus, Search } from 'lucide-react'
import {
  NavLink,
  Outlet,
  useMatch,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import type { Domain, NoteSummary } from '../../api/types'
import { Button } from '../../components/ui/button'
import { DomainDot } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { Loading } from '../../components/ui/spinner'
import { humanDay } from '../../lib/date'
import { cn } from '../../lib/utils'
import { useDomains } from '../domains/queries'
import { useCreateNote, useNotes } from './queries'

/**
 * List and editor side by side, from the mockup.
 *
 * On phones only one pane shows at a time — the list at /notes, the editor at
 * /notes/:id — so the back link in the editor is a real navigation rather than
 * decoration.
 */
export default function NotesPage() {
  const selected = useMatch('/notes/:id')

  return (
    <div className="flex flex-col gap-6">
      <div className={cn('md:block', selected && 'hidden')}>
        <h1 className="text-2xl font-bold tracking-tight text-surface-fg">
          Catatan
        </h1>
        <p className="mt-1 text-sm text-muted-fg">
          Tulis dulu, rapikan nanti. Kartu ditulis langsung di dalam catatan.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[20rem_1fr] lg:grid-cols-[22rem_1fr]">
        <div className={cn('md:block', selected && 'hidden')}>
          <NoteListPane />
        </div>
        <div className={cn('min-w-0 md:block', !selected && 'hidden')}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function NoteListPane() {
  const { data: notes, isPending, error } = useNotes()
  const { data: domains } = useDomains()
  const create = useCreateNote()
  const navigate = useNavigate()

  // The query lives in the URL so the top bar's search box and this one are the
  // same filter rather than two that disagree.
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const setQuery = (q: string) =>
    setParams(q ? { q } : {}, { replace: true, preventScrollReset: true })

  function newNote() {
    create.mutate({ contentMd: '' }, { onSuccess: (n) => navigate(`/notes/${n.id}`) })
  }

  // A client-side filter over the list already in memory, not search. Full-text
  // search stays deferred to v0.2 (D-031) — the placeholder says "judul" so it
  // does not promise more than it does.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes ?? []
    return (notes ?? []).filter((n) => n.title.toLowerCase().includes(q))
  }, [notes, query])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-fg" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari judul…"
            className="pl-9"
          />
        </div>
        <Button variant="primary" onClick={newNote} disabled={create.isPending}>
          <Plus />
          {create.isPending ? 'Sebentar…' : 'Catatan baru'}
        </Button>
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

      {filtered.length > 0 && (
        <ul className="flex flex-col gap-2">
          {filtered.map((note) => (
            <li key={note.id}>
              <NoteRow note={note} domains={domains} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NoteRow({
  note,
  domains,
}: {
  note: NoteSummary
  domains: Domain[] | undefined
}) {
  const domain = domains?.find((d) => d.id === note.domainId)

  return (
    <NavLink
      to={`/notes/${note.id}`}
      className={({ isActive }) =>
        cn(
          'flex flex-col gap-1.5 rounded-lg border px-4 py-3 transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
          isActive
            ? 'border-primary bg-accent'
            : 'border-border bg-card hover:bg-muted',
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className="flex items-baseline justify-between gap-3">
            {domain ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <DomainDot color={domain.color} />
                <span className="truncate text-xs text-muted-fg">
                  {domain.label}
                </span>
              </span>
            ) : (
              <span />
            )}
            <span className="shrink-0 text-xs text-subtle-fg">
              {humanDay(note.updatedAt)}
            </span>
          </div>

          <span
            className={cn(
              'truncate text-sm font-medium',
              isActive ? 'text-accent-fg' : 'text-card-fg',
            )}
          >
            {note.title || 'Tanpa judul'}
          </span>

          {note.cardCount > 0 && (
            <span className="text-xs text-subtle-fg">
              {note.cardCount} kartu
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}
