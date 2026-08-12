import { useMemo, useState } from 'react'
import { Plus, Search, Trash2, Undo2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Category, Domain, NoteSummary } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { CategoryChips } from '../../components/ui/category'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { SelectCheckbox, SelectionBar } from '../../components/ui/selection-bar'
import { Loading } from '../../components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { usePeekMode } from '../../components/ui/peek-panel'
import { useViewMode, ViewToggle } from '../../components/ui/view-toggle'
import { humanDay } from '../../lib/date'
import { usePeekedId, usePeekNavigation } from '../../lib/peek-route'
import { useSelection } from '../../lib/use-selection'
import { cn } from '../../lib/utils'
import { useAllCategories } from '../categories/queries'
import { useDomains } from '../domains/queries'
import { useCreateNote, useDeleteNotes, useNotes, useRestoreNotes } from './queries'

/**
 * The note index.
 *
 * It used to be a two-pane layout with the editor mounted in an `<Outlet>`.
 * The editor is its own full-width route now, which is what lets it show write
 * and preview side by side instead of as a mode — the pane was the constraint,
 * not the design.
 *
 * It is also where notes are deleted, one or many. Deleting is soft (00005):
 * the selection moves to the Terhapus view, which is this same screen asked
 * the other way, and comes back whole from there.
 */
export default function NotesPage() {
  const navigate = useNavigate()
  const [view, setView] = useViewMode('konku:notes-view')

  // Opening an item peeks at it rather than leaving the list, unless the
  // preference says otherwise. The peek is a URL — `/notes/:id` — so Back
  // closes it and the link is copyable; App renders the panel and keeps this
  // list mounted underneath. See lib/peek-route.
  const [peekMode] = usePeekMode()
  const peek = usePeekNavigation()
  const peekId = usePeekedId('/notes/')

  // The query lives in the URL so the top bar's search box and this one are
  // the same filter rather than two that disagree.
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const categoryId = params.get('categoryId')
  const deleted = params.get('deleted') === 'true'

  const [confirming, setConfirming] = useState(false)
  // What the last delete removed, so it can be put straight back. Holding the
  // ids rather than a flag is what makes the undo exact: it restores what was
  // deleted, not "whatever is in the bin now".
  const [undo, setUndo] = useState<{ ids: string[]; count: number } | null>(null)

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true, preventScrollReset: true })
    // The offer belongs to the list it was made on. Carrying it across a
    // filter change would leave an "undo" button floating over notes it has
    // nothing to do with.
    setUndo(null)
  }

  const { data: notes, isPending, error } = useNotes({ categoryId, deleted })
  const { data: domains } = useDomains()
  const { data: categories } = useAllCategories()
  const create = useCreateNote()
  const removeMany = useDeleteNotes()
  const restoreMany = useRestoreNotes()

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

  const selection = useSelection(useMemo(() => filtered.map((n) => n.id), [filtered]))

  // A deleted note answers 404 everywhere else, so there is nothing to peek
  // at. In the Terhapus view a row is a thing you tick, not a thing you open.
  function open(noteId: string) {
    if (deleted) {
      selection.toggle(noteId)
      return
    }
    if (peekMode === 'full') navigate(`/notes/${noteId}`)
    else peek.open(`/notes/${noteId}`)
  }

  function confirmDelete() {
    const ids = selection.ids
    removeMany.mutate(ids, {
      onSuccess: (result) => {
        setConfirming(false)
        selection.clear()
        setUndo({ ids, count: result.count })
      },
    })
  }

  function undoDelete() {
    if (!undo) return
    restoreMany.mutate(undo.ids, { onSuccess: () => setUndo(null) })
  }

  function restoreSelected() {
    const ids = selection.ids
    restoreMany.mutate(ids, { onSuccess: () => selection.clear() })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={deleted ? 'Terhapus' : 'Catatan'}
        description={
          deleted
            ? 'Catatan yang kamu hapus. Bisa dikembalikan selama 30 hari, setelah itu hilang permanen.'
            : 'Tulis dulu, rapikan nanti.'
        }
        meta={
          !isPending && (
            <span>
              {notes?.length ?? 0} catatan
            </span>
          )
        }
        actions={
          deleted ? (
            <Button variant="secondary" onClick={() => setParam('deleted', null)}>
              Kembali ke catatan
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setParam('deleted', 'true')}>
                <Trash2 />
                Terhapus
              </Button>
              <Button variant="primary" onClick={newNote} disabled={create.isPending}>
                <Plus />
                {create.isPending ? 'Sebentar…' : 'Catatan baru'}
              </Button>
            </>
          )
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
      {removeMany.isError && <Notice>{removeMany.error.message}</Notice>}
      {restoreMany.isError && <Notice>{restoreMany.error.message}</Notice>}

      {/*
        States what happened and offers the way back, in one line. No warning
        tone and no countdown to catch: the note is in Terhapus either way, and
        this is the shortcut, not the only route (hard rule 6).
      */}
      {undo && (
        <Notice className="flex flex-wrap items-center gap-3">
          <span>
            {undo.count} catatan dipindahkan ke Terhapus.
          </span>
          <Button
            variant="link"
            size="inline"
            onClick={undoDelete}
            disabled={restoreMany.isPending}
          >
            <Undo2 />
            Urungkan
          </Button>
        </Notice>
      )}

      {selection.count > 0 && (
        <SelectionBar
          count={selection.count}
          allSelected={selection.allSelected}
          onToggleAll={selection.toggleAll}
          onClear={selection.clear}
        >
          {deleted ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={restoreSelected}
              disabled={restoreMany.isPending}
            >
              <Undo2 />
              {restoreMany.isPending ? 'Mengembalikan…' : 'Kembalikan'}
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 />
              Hapus
            </Button>
          )}
        </SelectionBar>
      )}

      {notes && notes.length === 0 && (
        /*
         * An empty library is a starting point, not a failure. No sad-box
         * illustration and no "you haven't written anything yet" — the copy
         * says what to do next and makes it small (GOALS.md).
         */
        <EmptyState
          title={deleted ? 'Tidak ada catatan terhapus.' : 'Belum ada catatan.'}
          description={
            deleted
              ? 'Catatan yang kamu hapus akan muncul di sini.'
              : 'Mulai dari satu baris saja.'
          }
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
                <NoteTile
                  note={note}
                  domains={domains}
                  categories={categories}
                  active={peekId === note.id}
                  selected={selection.selected.has(note.id)}
                  anySelected={selection.count > 0}
                  onToggle={() => selection.toggle(note.id)}
                  onOpen={() => open(note.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {filtered.map((note) => (
                <li key={note.id}>
                  <NoteRow
                    note={note}
                    domains={domains}
                    categories={categories}
                    active={peekId === note.id}
                    selected={selection.selected.has(note.id)}
                    anySelected={selection.count > 0}
                    onToggle={() => selection.toggle(note.id)}
                    onOpen={() => open(note.id)}
                  />
                </li>
              ))}
            </ul>
          </Card>
        ))}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={selection.count === 1 ? 'Hapus catatan ini?' : `Hapus ${selection.count} catatan?`}
        description="Catatan pindah ke Terhapus beserta kategorinya, dan bisa dikembalikan selama 30 hari."
        confirmLabel="Hapus"
        pending={removeMany.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function useNoteMeta(note: NoteSummary, domains: Domain[] | undefined) {
  return domains?.find((d) => d.id === note.domainId)
}

interface RowProps {
  note: NoteSummary
  domains: Domain[] | undefined
  categories: Category[] | undefined
  active: boolean
  selected: boolean
  /** Something is ticked, so the checkbox column stays visible on every row. */
  anySelected: boolean
  onToggle: () => void
  onOpen: () => void
}

function NoteRow({
  note,
  domains,
  categories,
  active,
  selected,
  anySelected,
  onToggle,
  onOpen,
}: RowProps) {
  const domain = useNoteMeta(note, domains)

  return (
    // The checkbox is a sibling of the button, never inside it: a <button>
    // cannot legally contain another control, and nesting one breaks both the
    // keyboard order and the row's own click target.
    <div
      className={cn(
        'group flex items-center gap-3 px-4 transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
        active ? 'bg-accent' : selected ? 'bg-muted' : 'hover:bg-muted',
      )}
    >
      <SelectCheckbox
        checked={selected}
        onToggle={onToggle}
        visible={anySelected}
        label={`Pilih ${note.title || 'Tanpa judul'}`}
      />

      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 flex-col gap-1.5 py-3 text-left"
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
      </button>
    </div>
  )
}

function NoteTile({
  note,
  domains,
  categories,
  active,
  selected,
  anySelected,
  onToggle,
  onOpen,
}: RowProps) {
  const domain = useNoteMeta(note, domains)

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col gap-2 rounded-lg border px-4 py-3',
        'transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
        active
          ? 'border-primary bg-accent'
          : selected
            ? 'border-primary bg-muted'
            : 'border-border bg-card hover:bg-muted',
      )}
    >
      {/*
        The click target, stretched behind the content, so the whole tile opens
        the note while the checkbox above it stays its own control. The content
        is pointer-transparent; only the checkbox takes clicks back.
      */}
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        aria-label={note.title || 'Tanpa judul'}
        className="absolute inset-0 rounded-lg"
      />

      <div className="pointer-events-none relative flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <SelectCheckbox
            checked={selected}
            onToggle={onToggle}
            visible={anySelected}
            label={`Pilih ${note.title || 'Tanpa judul'}`}
            className="pointer-events-auto"
          />
          {domain && (
            <>
              <DomainDot color={domain.color} />
              <span className="truncate text-xs text-muted-fg">{domain.label}</span>
            </>
          )}
        </span>
        <span className="shrink-0 text-xs text-subtle-fg">
          {humanDay(note.updatedAt)}
        </span>
      </div>

      <span className="pointer-events-none relative line-clamp-2 text-sm font-medium text-card-fg">
        {note.title || 'Tanpa judul'}
      </span>

      <CategoryChips
        ids={note.categoryIds}
        categories={categories}
        className="pointer-events-none relative mt-auto pt-1"
      />
    </div>
  )
}
