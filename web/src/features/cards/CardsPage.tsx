import { useMemo, useState } from 'react'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Category, CardSummary, Domain } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { CategoryChips } from '../../components/ui/category'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { LoadMore } from '../../components/ui/load-more'
import { FilterBar } from '../../components/ui/filter-bar'
import { SearchInput } from '../../components/ui/search-input'
import { DetailPlaceholder, ListDetail } from '../../components/ui/list-detail'
import { MarkdownInline } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { SelectCheckbox, SelectionBar } from '../../components/ui/selection-bar'
import { Separator } from '../../components/ui/separator'
import { Loading } from '../../components/ui/spinner'
import { useViewMode, ViewToggle, type ViewMode } from '../../components/ui/view-toggle'
import { useCopy } from '../../i18n'
import { useAutoSelect, usePeekedId, usePeekNavigation } from '../../lib/peek-route'
import { useSelection } from '../../lib/use-selection'
import { cn } from '../../lib/utils'
import { useAllCategories } from '../categories/queries'
import { useDomains } from '../domains/queries'
import { CardPeek } from './CardPeek'
import { useCards, useDeleteCards, useRestoreCards } from './queries'

/**
 * The card index.
 *
 * This page used to say cards were written in notes and could not be created
 * here. D-055 inverted that: here is the only place a card is created, and the
 * list shows prompts only — the answer arrives when you open one, which is the
 * same recall-before-reveal shape the review screen uses (D-003).
 *
 * Deleting is soft and always has been, because a finished exam attempt renders
 * its questions by joining cards. The Terhapus view is what makes that soft
 * delete reachable: restoring brings the card back with its schedule and its
 * whole review history, since card_schedules was never touched.
 */
export default function CardsPage() {
  const c = useCopy().cards
  const [view, setView] = useViewMode('konku:cards-view')
  const [params, setParams] = useSearchParams()

  // The peek is a URL — `/cards/:id` — so Back closes it and the link is
  // copyable, while App keeps this list mounted against the background
  // location. The preview is rendered by this page rather than floating over
  // it, which is what lets the view toggle decide its shape; see ListDetail.
  const peek = usePeekNavigation()
  const peekId = usePeekedId('/cards/')

  const query = params.get('q') ?? ''
  // Repeated parameters, not comma-joined values: `?domainId=a&domainId=b` is
  // what URLSearchParams and the Go handler both already speak.
  const domainIds = params.getAll('domainId').filter(Boolean)
  const categoryIds = params.getAll('categoryId').filter(Boolean)
  const deleted = params.get('deleted') === 'true'

  const [confirming, setConfirming] = useState(false)
  // What the last delete removed, so it can be put straight back. The ids, not
  // a flag: the undo restores exactly what went, not whatever is in the bin.
  const [undo, setUndo] = useState<{ ids: string[]; count: number } | null>(null)

  /*
   * Both of these update through the functional form, never from the `params`
   * this render closed over. Ticking two domains in quick succession is one
   * gesture, and the second click lands before the first navigation has
   * re-rendered this component — a snapshot rebuilt from the stale `params`
   * writes back a URL the first value never reached, and one of the two
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
    // The offer belongs to the list it was made on.
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

  // Filtering is the server's job on both index screens now: a client-side
  // filter over a page searches what happened to be loaded and presents the
  // result as though it had searched everything (D-084).
  const {
    cards,
    total,
    isPending,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useCards({ domainIds, categoryIds, q: query, deleted })
  const { data: domains } = useDomains()
  const { data: categories } = useAllCategories()
  const removeMany = useDeleteCards()
  const restoreMany = useRestoreCards()

  const filtering = Boolean(query.trim() || domainIds.length || categoryIds.length)

  const selection = useSelection(useMemo(() => cards.map((c) => c.id), [cards]))

  // A deleted card answers 404 everywhere else, so there is nothing to peek
  // at. In the Terhapus view a row is a thing you tick, not a thing you open.
  function open(cardId: string) {
    if (deleted) {
      selection.toggle(cardId)
      return
    }
    peek.open(`/cards/${cardId}`)
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
   * The view toggle decides the shape of both halves of this screen (D-078):
   * a list splits the page and previews beside it, a grid takes the full width
   * and previews in a modal. Neither happens in the Terhapus view, where a
   * deleted card answers 404 everywhere else and there is nothing to preview.
   */
  const split = view === 'list' && !deleted
  const preview =
    peekId && !deleted ? (
      <CardPeek
        cardId={peekId}
        mode={view === 'list' ? 'side' : 'center'}
        onClose={peek.close}
      />
    ) : null

  // In list view the top card is open on arrival, so the second column is
  // never a placeholder asking for a click it could have made itself.
  useAutoSelect({
    enabled: split,
    ids: useMemo(() => cards.map((c) => c.id), [cards]),
    peekedId: peekId,
    toPath: (id) => `/cards/${id}`,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={deleted ? c.deleted.title : c.index.title}
        description={deleted ? c.deleted.description : c.index.description}
        meta={
          /*
            The collection, not the page — the header used to state the length
            of a list that stopped at 500 (D-084).

            Counted through the catalog rather than `{total} kartu`: Indonesian
            writes 20.000 where English writes 20,000, and the 07 L8 card quota
            is 20.000, so a raw interpolation prints 20000 in both.
          */
          !isPending && <span>{c.index.count(total)}</span>
        }
        actions={
          deleted ? (
            <Button variant="secondary" onClick={() => setParam('deleted', null)}>
              {c.deleted.back}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setParam('deleted', 'true')}>
                <Trash2 />
                {c.deleted.title}
              </Button>
              <Button asChild variant="secondary">
                <Link to="/review/due">{c.index.startReview}</Link>
              </Button>
              <Button asChild variant="primary">
                <Link to="/cards/new">
                  <Plus />
                  {c.index.newCard}
                </Link>
              </Button>
            </>
          )
        }
      />

      {error && <Notice>{error.message}</Notice>}
      {removeMany.isError && <Notice>{removeMany.error.message}</Notice>}
      {restoreMany.isError && <Notice>{restoreMany.error.message}</Notice>}

      {undo && (
        <Notice className="flex flex-wrap items-center gap-3">
          <span>{c.deleted.undo.moved(undo.count)}</span>
          <Button
            variant="link"
            size="inline"
            onClick={undoDelete}
            disabled={restoreMany.isPending}
          >
            <Undo2 />
            {c.deleted.undo.action}
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
              {restoreMany.isPending ? c.deleted.restoring : c.deleted.restore}
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 />
              {c.index.delete}
            </Button>
          )}
        </SelectionBar>
      )}

      <ListDetail
        split={split}
        peeked={peekId !== null}
        detail={preview}
        placeholder={<DetailPlaceholder>{c.index.placeholder}</DetailPlaceholder>}
      >
        <div className="flex flex-col gap-4">
          {/*
            The controls are a bare group, not a panel of their own — a border
            around a search box and two dropdowns that each already have one,
            stacked directly above the first card's, is three lines saying one
            thing. The rule below says it once: everything above narrows the
            list, everything below is the list.
          */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <SearchInput
                className="flex-1 @2xl:max-w-sm"
                value={query}
                onChange={(next) => setParam('q', next)}
                placeholder={c.index.search.placeholder}
                label={c.index.search.label}
              />
              <ViewToggle mode={view} onChange={setView} />
            </div>

            {/*
              Two dropdowns rather than two rows of chips (D-078). This page
              had the worse version of the problem: five domains on one row and
              every category on another, both above the list they filter.
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

          {/* Under the rule, where the rows are about to be. See NotesPage. */}
          {isPending && <Loading className="py-4" />}

          {!isPending && cards.length === 0 && !filtering && (
            <EmptyState
              title={deleted ? c.deleted.empty.title : c.index.empty.title}
              description={
                deleted ? c.deleted.empty.description : c.index.empty.description
              }
              action={
                !deleted && (
                  <Button asChild variant="primary" size="sm">
                    <Link to="/cards/new">{c.index.newCard}</Link>
                  </Button>
                )
              }
            />
          )}

          {!isPending && cards.length === 0 && filtering && (
            <p className="py-4 text-sm text-muted-fg">{c.index.noMatch}</p>
          )}

          {/*
            Container queries, not viewport ones. In list view this sits in a
            28rem column and in grid view it has the whole page, and
            `lg:grid-cols-3` would ask the screen how wide it is and get an
            answer about the wrong box either way.
          */}
          {cards.length > 0 && (
            <ul
              className={cn(
                'grid',
                // Rows are one line of text and sit closer than cells do: a
                // grid cell is a block with its own weight, a row is part of a
                // sequence you scan down.
                view === 'grid'
                  ? 'gap-3 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4'
                  : 'gap-1.5',
              )}
            >
              {cards.map((c) => (
                <li key={c.id}>
                  <CardItem
                    card={c}
                    domains={domains}
                    categories={categories}
                    layout={view}
                    active={peekId === c.id}
                    selected={selection.selected.has(c.id)}
                    anySelected={selection.count > 0}
                    onToggle={() => selection.toggle(c.id)}
                    onOpen={() => open(c.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          <LoadMore
            loaded={cards.length}
            total={total}
            hasMore={Boolean(hasNextPage)}
            loading={isFetchingNextPage}
            error={error}
            onLoadMore={() => fetchNextPage()}
            /*
              The whole label, not a noun for `LoadMore` to build a sentence
              around: English needs the count to pick "card" or "cards", and a
              bare noun cannot agree with a number the component holds.
            */
            remainingLabel={c.index.loadMore}
          />
        </div>
      </ListDetail>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={
          selection.count === 1
            ? c.confirmDelete.one
            : c.confirmDelete.many(selection.count)
        }
        description={c.confirmDelete.description}
        confirmLabel={c.confirmDelete.confirm}
        pending={removeMany.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

interface CardItemProps {
  card: CardSummary
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
 * One card in the index, as a card in both views. Same shape as `NoteItem`, and
 * for the same reason: two components for two views drift, and the two views
 * are one design.
 *
 * The prompt only. The answer arrives when you open one, which is the same
 * recall-before-reveal shape the review screen uses (D-003) — and the list is
 * where an accidental glance would actually happen.
 */
function CardItem({
  card,
  domains,
  categories,
  layout,
  active,
  selected,
  anySelected,
  onToggle,
  onOpen,
}: CardItemProps) {
  const c = useCopy().cards
  const domain = domains?.find((d) => d.id === card.domainId)
  const row = layout === 'list'

  const checkbox = (
    <SelectCheckbox
      checked={selected}
      onToggle={onToggle}
      visible={anySelected}
      label={c.index.selectCard}
      className="pointer-events-auto"
    />
  )

  const domainTag = domain && (
    <span className="flex min-w-0 items-center gap-1.5">
      <DomainDot color={domain.color} />
      <span className="truncate text-xs text-muted-fg">{domain.label}</span>
    </span>
  )

  // Nothing to say on the second line. Cards are commonly untagged — capture
  // must never block on a decision the user has not made (hard rule 7) — so
  // rendering it anyway leaves most rows with a band of whitespace under them.
  const hasLabels = Boolean(domain) || card.categoryIds.length > 0

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
        it while the checkbox on top stays its own control. The checkbox is a
        *sibling* of this button, never inside it — a <button> cannot legally
        contain another control.
      */}
      {/*
        Named by its prompt, not "Buka kartu". The stretched button is the only
        control in the card, so its label is the whole of what a screen reader
        gets — and five hundred buttons all called "Buka kartu" is a list you
        cannot navigate. It is the card's own text, the same way NoteItem names
        itself with its title.
      */}
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        aria-label={card.front}
        className="absolute inset-0 rounded-lg"
      />

      {row ? (
        <>
          {/* Leading, the way a control at the edge of a row reads. In a grid
              cell it sits on the meta line instead, because a cell has no
              leading edge to speak of. */}
          <span className="relative shrink-0">{checkbox}</span>

          <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1.5">
            {/* The front is markdown, so it renders rather than showing syntax. */}
            <MarkdownInline className="line-clamp-2 text-sm text-card-fg">
              {card.front}
            </MarkdownInline>
            {hasLabels && (
              <div className="flex flex-wrap items-center gap-2">
                {domainTag}
                <CategoryChips ids={card.categoryIds} categories={categories} />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="pointer-events-none relative flex min-w-0 items-center gap-1.5">
            {checkbox}
            {domainTag}
          </div>

          <MarkdownInline className="pointer-events-none relative line-clamp-4 text-sm text-card-fg">
            {card.front}
          </MarkdownInline>

          <CategoryChips
            ids={card.categoryIds}
            categories={categories}
            className="pointer-events-none relative mt-auto pt-1"
          />
        </>
      )}
    </div>
  )
}
