import { useMemo, useState } from 'react'
import { Plus, Search, Trash2, Undo2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Category, CardSummary, Domain } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { CategoryChips } from '../../components/ui/category'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { MarkdownInline } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { SelectCheckbox, SelectionBar } from '../../components/ui/selection-bar'
import { Loading } from '../../components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { usePeekMode } from '../../components/ui/peek-panel'
import { useViewMode, ViewToggle } from '../../components/ui/view-toggle'
import { usePeekedId, usePeekNavigation } from '../../lib/peek-route'
import { useSelection } from '../../lib/use-selection'
import { cn } from '../../lib/utils'
import { useAllCategories } from '../categories/queries'
import { useDomains } from '../domains/queries'
import { CARD_LIMIT, useCards, useDeleteCards, useRestoreCards } from './queries'

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
  const navigate = useNavigate()
  const [view, setView] = useViewMode('konku:cards-view')
  const [params, setParams] = useSearchParams()

  // The peek is a URL — `/cards/:id` — so Back closes it and the link is
  // copyable. App renders the panel; this list stays mounted underneath.
  const [peekMode] = usePeekMode()
  const peek = usePeekNavigation()
  const peekId = usePeekedId('/cards/')

  const query = params.get('q') ?? ''
  const domainId = params.get('domainId')
  const categoryId = params.get('categoryId')
  const deleted = params.get('deleted') === 'true'

  const [confirming, setConfirming] = useState(false)
  // What the last delete removed, so it can be put straight back. The ids, not
  // a flag: the undo restores exactly what went, not whatever is in the bin.
  const [undo, setUndo] = useState<{ ids: string[]; count: number } | null>(null)

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true, preventScrollReset: true })
    // The offer belongs to the list it was made on.
    setUndo(null)
  }

  // Filtering is the server's job here, unlike notes: the list is capped at
  // 500 and a client-side filter would silently search only the first page.
  const { data, isPending, error } = useCards({ domainId, categoryId, q: query, deleted })
  const { data: domains } = useDomains()
  const { data: categories } = useAllCategories()
  const removeMany = useDeleteCards()
  const restoreMany = useRestoreCards()

  const cards = useMemo(() => data ?? [], [data])
  const filtering = Boolean(query.trim() || domainId || categoryId)

  const selection = useSelection(useMemo(() => cards.map((c) => c.id), [cards]))

  // A deleted card answers 404 everywhere else, so there is nothing to peek
  // at. In the Terhapus view a row is a thing you tick, not a thing you open.
  function open(cardId: string) {
    if (deleted) {
      selection.toggle(cardId)
      return
    }
    if (peekMode === 'full') navigate(`/cards/${cardId}`)
    else peek.open(`/cards/${cardId}`)
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
        title={deleted ? 'Terhapus' : 'Kartu'}
        description={
          deleted
            ? 'Kartu yang kamu hapus. Dikembalikan lengkap dengan riwayat ulangannya. Kartu yang belum pernah diulang hilang permanen setelah 30 hari.'
            : 'Satu pertanyaan, satu jawaban. Ditulis di sini, diulang di layar ulangan.'
        }
        meta={!isPending && <span>{cards.length} kartu</span>}
        actions={
          deleted ? (
            <Button variant="secondary" onClick={() => setParam('deleted', null)}>
              Kembali ke kartu
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setParam('deleted', 'true')}>
                <Trash2 />
                Terhapus
              </Button>
              <Button asChild variant="secondary">
                <Link to="/review">Mulai ulangan</Link>
              </Button>
              <Button asChild variant="primary">
                <Link to="/cards/new">
                  <Plus />
                  Kartu baru
                </Link>
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
              placeholder="Cari isi kartu…"
              className="pl-9"
            />
          </div>
          <ViewToggle mode={view} onChange={setView} />
        </div>

        {domains && domains.length > 0 && (
          <ToggleGroup>
            <ToggleGroupItem
              selected={domainId === null}
              onClick={() => setParam('domainId', null)}
            >
              Semua domain
            </ToggleGroupItem>
            {domains.map((d) => (
              <ToggleGroupItem
                key={d.id}
                selected={domainId === d.id}
                onClick={() => setParam('domainId', d.id)}
                className="inline-flex items-center gap-1.5"
              >
                <DomainDot color={d.color} />
                {d.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}

        {categories && categories.length > 0 && (
          <ToggleGroup>
            <ToggleGroupItem
              selected={categoryId === null}
              onClick={() => setParam('categoryId', null)}
            >
              Semua kategori
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
      {removeMany.isError && <Notice>{removeMany.error.message}</Notice>}
      {restoreMany.isError && <Notice>{restoreMany.error.message}</Notice>}

      {undo && (
        <Notice className="flex flex-wrap items-center gap-3">
          <span>{undo.count} kartu dipindahkan ke Terhapus.</span>
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

      {data && cards.length === 0 && !filtering && (
        <EmptyState
          title={deleted ? 'Tidak ada kartu terhapus.' : 'Belum ada kartu.'}
          description={
            deleted
              ? 'Kartu yang kamu hapus akan muncul di sini.'
              : 'Satu pertanyaan yang ingin kamu ingat sudah cukup untuk mulai.'
          }
          action={
            !deleted && (
              <Button asChild variant="primary" size="sm">
                <Link to="/cards/new">Kartu baru</Link>
              </Button>
            )
          }
        />
      )}

      {data && cards.length === 0 && filtering && (
        <p className="py-4 text-sm text-muted-fg">Tidak ada kartu yang cocok.</p>
      )}

      {cards.length > 0 &&
        (view === 'grid' ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <li key={c.id}>
                <CardTile
                  card={c}
                  domains={domains}
                  categories={categories}
                  active={peekId === c.id}
                  selected={selection.selected.has(c.id)}
                  anySelected={selection.count > 0}
                  onToggle={() => selection.toggle(c.id)}
                  onOpen={() => open(c.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {cards.map((c) => (
                <li key={c.id}>
                  <CardRow
                    card={c}
                    domains={domains}
                    categories={categories}
                    active={peekId === c.id}
                    selected={selection.selected.has(c.id)}
                    anySelected={selection.count > 0}
                    onToggle={() => selection.toggle(c.id)}
                    onOpen={() => open(c.id)}
                  />
                </li>
              ))}
            </ul>
          </Card>
        ))}

      {/*
        Said plainly rather than paginated. If this ever trips, paging is the
        fix, not a silent truncation.
      */}
      {cards.length >= CARD_LIMIT && (
        <p className="text-xs text-subtle-fg">
          Menampilkan {CARD_LIMIT} kartu pertama.
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={selection.count === 1 ? 'Hapus kartu ini?' : `Hapus ${selection.count} kartu?`}
        description="Kartu pindah ke Terhapus. Jadwal dan riwayat ulangannya tetap utuh. Kartu yang pernah kamu ulang bisa dikembalikan kapan saja; yang belum pernah, selama 30 hari."
        confirmLabel="Hapus"
        pending={removeMany.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

interface CardRowProps {
  card: CardSummary
  domains: Domain[] | undefined
  categories: Category[] | undefined
  active: boolean
  selected: boolean
  /** Something is ticked, so the checkbox column stays visible on every row. */
  anySelected: boolean
  onToggle: () => void
  onOpen: () => void
}

function CardRow({
  card,
  domains,
  categories,
  active,
  selected,
  anySelected,
  onToggle,
  onOpen,
}: CardRowProps) {
  const domain = domains?.find((d) => d.id === card.domainId)

  return (
    // The checkbox is a sibling of the button, never inside it: a <button>
    // cannot legally contain another control.
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
        label="Pilih kartu ini"
      />

      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 flex-col gap-1.5 py-3 text-left"
      >
        {/* The front is markdown now, so it renders rather than showing syntax. */}
        <MarkdownInline className="text-sm text-card-fg">{card.front}</MarkdownInline>

        <div className="flex flex-wrap items-center gap-2">
          {domain && (
            <span className="flex min-w-0 items-center gap-1.5">
              <DomainDot color={domain.color} />
              <span className="truncate text-xs text-muted-fg">{domain.label}</span>
            </span>
          )}
          <CategoryChips ids={card.categoryIds} categories={categories} />
        </div>
      </button>
    </div>
  )
}

function CardTile({
  card,
  domains,
  categories,
  active,
  selected,
  anySelected,
  onToggle,
  onOpen,
}: CardRowProps) {
  const domain = domains?.find((d) => d.id === card.domainId)

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
        the card while the checkbox above it stays its own control.
      */}
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        aria-label="Buka kartu"
        className="absolute inset-0 rounded-lg"
      />

      <div className="pointer-events-none relative flex min-w-0 items-center gap-1.5">
        <SelectCheckbox
          checked={selected}
          onToggle={onToggle}
          visible={anySelected}
          label="Pilih kartu ini"
          className="pointer-events-auto"
        />
        {domain && (
          <>
            <DomainDot color={domain.color} />
            <span className="truncate text-xs text-muted-fg">{domain.label}</span>
          </>
        )}
      </div>

      <MarkdownInline className="pointer-events-none relative line-clamp-4 text-sm text-card-fg">
        {card.front}
      </MarkdownInline>

      <CategoryChips
        ids={card.categoryIds}
        categories={categories}
        className="pointer-events-none relative mt-auto pt-1"
      />
    </div>
  )
}
