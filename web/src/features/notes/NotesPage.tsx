import { useMemo, useState } from 'react'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Category, Domain, NoteSummary } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { CategoryChips } from '../../components/ui/category'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { LoadMore } from '../../components/ui/load-more'
import { FilterBar } from '../../components/ui/filter-bar'
import { SearchInput } from '../../components/ui/search-input'
import { DetailPlaceholder, ListDetail } from '../../components/ui/list-detail'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { SelectCheckbox, SelectionBar } from '../../components/ui/selection-bar'
import { Separator } from '../../components/ui/separator'
import { Loading } from '../../components/ui/spinner'
import { useViewMode, ViewToggle, type ViewMode } from '../../components/ui/view-toggle'
import { humanDay } from '../../lib/date'
import { useAutoSelect, usePeekedId, usePeekNavigation } from '../../lib/peek-route'
import { useSelection } from '../../lib/use-selection'
import { cn } from '../../lib/utils'
import { useAllCategories } from '../categories/queries'
import { useDomains } from '../domains/queries'
import { NotePeek } from './NotePeek'
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

  // Opening an item peeks at it rather than leaving the list. The peek is a
  // URL — `/notes/:id` — so Back closes it and the link is copyable, while App
  // keeps this list mounted against the background location. See
  // lib/peek-route.
  //
  // The preview is rendered *here*, as part of this page, rather than by App as
  // a panel floating over it. That is what lets the two share a header and a
  // height, and what lets the view toggle decide the preview's shape.
  const peek = usePeekNavigation()
  const peekId = usePeekedId('/notes/')

  // The query lives in the URL so the top bar's search box and this one are
  // the same filter rather than two that disagree.
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  // Repeated parameters, not comma-joined values: `?categoryId=a&categoryId=b`
  // is what URLSearchParams and the Go handler both already speak, so nothing
  // has to agree on a separator or escape one out of a label.
  const categoryIds = params.getAll('categoryId').filter(Boolean)
  const domainIds = params.getAll('domainId').filter(Boolean)
  const deleted = params.get('deleted') === 'true'

  const [confirming, setConfirming] = useState(false)
  // What the last delete removed, so it can be put straight back. Holding the
  // ids rather than a flag is what makes the undo exact: it restores what was
  // deleted, not "whatever is in the bin now".
  const [undo, setUndo] = useState<{ ids: string[]; count: number } | null>(null)

  /*
   * Both of these update through the functional form, never from the `params`
   * this render closed over.
   *
   * Ticking two domains in quick succession is one gesture, and the second
   * click lands before the first navigation has re-rendered this component. A
   * `new URLSearchParams(params)` built from the stale snapshot then writes
   * back a URL that never had the first value in it, and one of the two
   * silently does not take.
   */
  function setParam(key: string, value: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true, preventScrollReset: true },
    )
    // The offer belongs to the list it was made on. Carrying it across a
    // filter change would leave an "undo" button floating over notes it has
    // nothing to do with.
    setUndo(null)
  }

  /** Flip one value of a repeatable parameter, against the latest URL. */
  function toggleParam(key: string, id: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const current = next.getAll(key).filter(Boolean)
        next.delete(key)
        for (const v of current) if (v !== id) next.append(key, v)
        if (!current.includes(id)) next.append(key, id)
        return next
      },
      { replace: true, preventScrollReset: true },
    )
    setUndo(null)
  }

  function clearParam(key: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(key)
        return next
      },
      { replace: true, preventScrollReset: true },
    )
    setUndo(null)
  }

  const {
    notes,
    total,
    isPending,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useNotes({ domainIds, categoryIds, q: query, deleted })
  const { data: domains } = useDomains()
  const { data: categories } = useAllCategories()
  const create = useCreateNote()
  const removeMany = useDeleteNotes()
  const restoreMany = useRestoreNotes()

  /*
   * Set the moment this screen hands over to the editor, and never unset:
   * the component is about to unmount either way.
   *
   * Creating a note invalidates the list, and the editor is `lazy()` while
   * React Router runs navigation as a transition — so this list stays mounted
   * and live while the editor's chunk is still in flight. If the refetch lands
   * in that window it takes the list from empty to one row with nothing
   * peeked, which is exactly what useAutoSelect exists to answer: it calls
   * `select()` with `replace: true` and overwrites the pending navigation with
   * a peek at the same URL. Same address bar, different history state, and the
   * editor never mounts — the brand new note opens read-only, with no field to
   * type in.
   *
   * That window only opens when the list was empty, because a list with rows
   * has already auto-selected one and that peekedId short-circuits the effect.
   * "Empty" is a new account writing its first note, which makes this the
   * first thing the product does to somebody (hard rule 7). The e2e suite
   * caught it on a loaded CI runner and stayed green on every laptop.
   */
  const [leaving, setLeaving] = useState(false)

  function newNote() {
    create.mutate(
      { contentMd: '' },
      {
        onSuccess: (n) => {
          // Before navigate, and synchronous, so the render that the refetch
          // triggers already sees auto-select disabled.
          setLeaving(true)
          navigate(`/notes/${n.id}`)
        },
      },
    )
  }

  // The search runs in SQL now (D-084). It used to filter the loaded list,
  // which searched the first 50 notes and looked like it had searched all of
  // them — and paging would have made that worse, since "no match" and "not on
  // this page" are indistinguishable to the person reading it. Ranked
  // full-text search stays deferred to v0.2 (D-031), so the placeholder says
  // "judul" and does not promise more than it does.
  const filtering = Boolean(query.trim() || domainIds.length || categoryIds.length)

  const selection = useSelection(useMemo(() => notes.map((n) => n.id), [notes]))

  // A deleted note answers 404 everywhere else, so there is nothing to peek
  // at. In the Terhapus view a row is a thing you tick, not a thing you open.
  function open(noteId: string) {
    if (deleted) {
      selection.toggle(noteId)
      return
    }
    peek.open(`/notes/${noteId}`)
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

  /*
   * The view toggle decides the shape of both halves of this screen (D-078).
   *
   * A list is narrow and leaves room beside it, so it splits the page and the
   * preview lives in the second column. A grid uses the full width and has no
   * room beside it, so the preview is a modal. There is no third control for
   * this and nothing remembered: one toggle, one answer.
   *
   * Neither happens in the Terhapus view — a deleted note answers 404
   * everywhere else, so there is nothing to preview.
   */
  const split = view === 'list' && !deleted
  const preview =
    peekId && !deleted ? (
      <NotePeek
        noteId={peekId}
        mode={view === 'list' ? 'side' : 'center'}
        onClose={peek.close}
      />
    ) : null

  // In list view the top note is open on arrival, so the second column is
  // never a placeholder asking for a click it could have made itself.
  useAutoSelect({
    enabled: split && !leaving,
    ids: useMemo(() => notes.map((n) => n.id), [notes]),
    peekedId: peekId,
    toPath: (id) => `/notes/${id}`,
  })

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
          /*
            The collection, not the page. Rendering the loaded count here is
            what told an account holding 300 notes that it had 50 (D-084).
          */
          !isPending && <span>{total} catatan</span>
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
          partial={Boolean(hasNextPage)}
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

      <ListDetail
        split={split}
        peeked={peekId !== null}
        detail={preview}
        placeholder={<DetailPlaceholder>Pilih catatan untuk membacanya di sini.</DetailPlaceholder>}
      >
        <div className="flex flex-col gap-4">
          {/*
            The controls are a bare group, not a panel of their own.

            They were a `<Card>` briefly, which put a border around the search
            box and the dropdowns — each of which already has one — and then
            stacked that border directly above the first item's. Three lines in
            twelve pixels, saying one thing. A rule below the group says it
            once, and it is the only boundary the eye needs here: everything
            above narrows the list, everything below is the list.
          */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <SearchInput
                className="flex-1 @2xl:max-w-sm"
                value={query}
                onChange={(next) => setParam('q', next)}
                placeholder="Cari judul…"
                label="Cari catatan"
              />
              <ViewToggle mode={view} onChange={setView} />
            </div>

            {/*
              Two dropdowns rather than two rows of chips (D-078). Chips were
              readable at five seeded domains and stopped being readable the
              moment categories became create-on-type: a filter bar that grows
              a line every time you label something pushes the list it filters
              off the screen, and it could never express "either of these two".
            */}
            <FilterBar
              domains={domains}
              categories={categories}
              domainIds={domainIds}
              categoryIds={categoryIds}
              onToggle={toggleParam}
              onClear={clearParam}
            />
          </div>

          <Separator />

          {/*
            In the list column, under the rule, where the rows are about to be.

            It used to sit above the two-column grid, which put "memuat" in one
            place and the thing being loaded in another — and the frame is
            already on screen by then, because ListDetail renders whether or not
            the page has arrived. Only the rows are missing, so this is the only
            spot where a loading state is describing what is actually pending.
          */}
          {isPending && <Loading className="px-1 py-4" />}

          {!isPending && notes.length === 0 && !filtering && (
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

          {!isPending && notes.length === 0 && filtering && (
            <p className="px-1 py-4 text-sm text-muted-fg">
              Tidak ada judul yang cocok.
            </p>
          )}

          {/*
            Container queries, not viewport ones. In list view this sits in a
            28rem column and in grid view it has the whole page, and
            `lg:grid-cols-3` would ask the screen how wide it is and get an
            answer about the wrong box either way.
          */}
          {notes.length > 0 && (
            <ul
              className={cn(
                'grid',
                // Rows are one line of text and sit closer than cells do: a
                // grid cell is a block with its own weight, a row is part of a
                // sequence you scan down.
                view === 'grid'
                  ? 'gap-3 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4'
                  : // One column, and it has to be named. A `grid` with no
                    // template gets one implicit `auto` track, and `auto` is
                    // bounded below by min-content — which for a row whose
                    // title is `truncate` (`white-space: nowrap`) is the
                    // *untruncated* title. So the track was sized by the very
                    // text truncation exists to clip: 541px inside a 448px
                    // column, and every row ran 93px under the preview panel
                    // beside it. `minmax(0,1fr)` lets the track shrink below
                    // min-content, which is what makes `truncate` truncate.
                    // CardsPage has the same markup and does not show it only
                    // because its rows wrap instead of truncating.
                    'gap-1.5 grid-cols-[minmax(0,1fr)]',
              )}
            >
              {notes.map((note) => (
                <li key={note.id}>
                  <NoteItem
                    note={note}
                    domains={domains}
                    categories={categories}
                    layout={view}
                    active={peekId === note.id}
                    selected={selection.selected.has(note.id)}
                    anySelected={selection.count > 0}
                    onToggle={() => selection.toggle(note.id)}
                    onOpen={() => open(note.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          <LoadMore
            loaded={notes.length}
            total={total}
            hasMore={Boolean(hasNextPage)}
            loading={isFetchingNextPage}
            error={error}
            onLoadMore={() => fetchNextPage()}
            noun="catatan"
          />
        </div>
      </ListDetail>

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

interface ItemProps {
  note: NoteSummary
  domains: Domain[] | undefined
  categories: Category[] | undefined
  /** Column in a grid cell, or row across the full width. */
  layout: ViewMode
  active: boolean
  selected: boolean
  /** Something is ticked, so the checkbox column stays visible on every row. */
  anySelected: boolean
  onToggle: () => void
  onOpen: () => void
}

/**
 * One note in the index, as a card in both views.
 *
 * The two views used to be two components: a bordered tile for the grid, and a
 * borderless row inside one big `<Card>` with `divide-y` for the list. They
 * drifted, because nothing made them agree — the tile grew a stretched click
 * target and pointer-transparent content while the row kept a button that only
 * covered part of itself, and selecting in one looked nothing like selecting in
 * the other.
 *
 * It is one component with one set of container classes now. `layout` changes
 * the axis and nothing else: a grid cell stacks its meta above the title, a row
 * puts the title first and pushes the date to the far edge, which is the only
 * thing a full-width item can do that a 24rem cell cannot.
 */
function NoteItem({
  note,
  domains,
  categories,
  layout,
  active,
  selected,
  anySelected,
  onToggle,
  onOpen,
}: ItemProps) {
  const domain = useNoteMeta(note, domains)
  const title = note.title || 'Tanpa judul'
  const row = layout === 'list'

  const checkbox = (
    <SelectCheckbox
      checked={selected}
      onToggle={onToggle}
      visible={anySelected}
      label={`Pilih ${title}`}
      className="pointer-events-auto"
    />
  )

  const domainTag = domain && (
    <span className="flex min-w-0 items-center gap-1.5">
      <DomainDot color={domain.color} />
      <span className="truncate text-xs text-muted-fg">{domain.label}</span>
    </span>
  )

  const date = (
    <span className="shrink-0 text-xs text-subtle-fg">{humanDay(note.updatedAt)}</span>
  )

  // Nothing to say on the second line. Rendering it anyway leaves a row of
  // whitespace under the title with an invisible checkbox floating in it —
  // which is what an untagged note looked like when the checkbox lived here.
  const hasLabels = Boolean(domain) || note.categoryIds.length > 0

  return (
    <div
      className={cn(
        'group relative rounded-lg border px-4 py-3',
        'transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
        row ? 'flex items-center gap-3' : 'flex h-full flex-col gap-2',
        active
          ? 'border-primary-ink bg-accent'
          : selected
            ? 'border-primary-ink bg-muted'
            : 'border-border bg-card hover:bg-muted',
      )}
    >
      {/*
        The click target, stretched behind the content, so the whole card opens
        the note while the checkbox on top of it stays its own control. The
        checkbox is a *sibling* of this button, never inside it: a <button>
        cannot legally contain another control. The content is
        pointer-transparent; only the checkbox takes clicks back.
      */}
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        aria-label={title}
        className="absolute inset-0 rounded-lg"
      />

      {row ? (
        <>
          {/* Leading, the way a control at the edge of a row reads. In a grid
              cell it sits on the meta line instead, because a cell has no
              leading edge to speak of. */}
          <span className="relative shrink-0">{checkbox}</span>

          <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="truncate text-sm font-medium text-card-fg">{title}</span>
            {hasLabels && (
              <div className="flex flex-wrap items-center gap-2">
                {domainTag}
                <CategoryChips ids={note.categoryIds} categories={categories} />
              </div>
            )}
          </div>

          <div className="pointer-events-none relative">{date}</div>
        </>
      ) : (
        <>
          <div className="pointer-events-none relative flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {checkbox}
              {domainTag}
            </span>
            {date}
          </div>

          <span className="pointer-events-none relative line-clamp-2 text-sm font-medium text-card-fg">
            {title}
          </span>

          <CategoryChips
            ids={note.categoryIds}
            categories={categories}
            className="pointer-events-none relative mt-auto pt-1"
          />
        </>
      )}
    </div>
  )
}
