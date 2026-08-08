import { Plus, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Category, CardSummary, Domain } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { CategoryChips } from '../../components/ui/category'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { MarkdownInline } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { Loading } from '../../components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useViewMode, ViewToggle } from '../../components/ui/view-toggle'
import { cn } from '../../lib/utils'
import { useAllCategories } from '../categories/queries'
import { useDomains } from '../domains/queries'
import { CARD_LIMIT, useCards } from './queries'

/**
 * The card index.
 *
 * This page used to say cards were written in notes and could not be created
 * here. D-055 inverted that: here is the only place a card is created, and the
 * list shows prompts only — the answer arrives when you open one, which is the
 * same recall-before-reveal shape the review screen uses (D-003).
 */
export default function CardsPage() {
  const [view, setView] = useViewMode('konku:cards-view')
  const [params, setParams] = useSearchParams()

  const query = params.get('q') ?? ''
  const domainId = params.get('domainId')
  const categoryId = params.get('categoryId')

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true, preventScrollReset: true })
  }

  // Filtering is the server's job here, unlike notes: the list is capped at
  // 500 and a client-side filter would silently search only the first page.
  const { data, isPending, error } = useCards({ domainId, categoryId, q: query })
  const { data: domains } = useDomains()
  const { data: categories } = useAllCategories()

  const cards = data ?? []
  const filtering = Boolean(query.trim() || domainId || categoryId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kartu"
        description="Satu pertanyaan, satu jawaban. Ditulis di sini, diulang di layar ulangan."
        meta={!isPending && <span>{cards.length} kartu</span>}
        actions={
          <>
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

      {data && cards.length === 0 && !filtering && (
        <EmptyState
          title="Belum ada kartu."
          description="Satu pertanyaan yang ingin kamu ingat sudah cukup untuk mulai."
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/cards/new">Kartu baru</Link>
            </Button>
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
                <CardTile card={c} domains={domains} categories={categories} />
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {cards.map((c) => (
                <li key={c.id}>
                  <CardRow card={c} domains={domains} categories={categories} />
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
    </div>
  )
}

function CardRow({
  card,
  domains,
  categories,
}: {
  card: CardSummary
  domains: Domain[] | undefined
  categories: Category[] | undefined
}) {
  const domain = domains?.find((d) => d.id === card.domainId)

  return (
    <Link
      to={`/cards/${card.id}`}
      className="flex flex-col gap-1.5 px-4 py-3 transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted"
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
    </Link>
  )
}

function CardTile({
  card,
  domains,
  categories,
}: {
  card: CardSummary
  domains: Domain[] | undefined
  categories: Category[] | undefined
}) {
  const domain = domains?.find((d) => d.id === card.domainId)

  return (
    <Link
      to={`/cards/${card.id}`}
      className={cn(
        'flex h-full flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3',
        'transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted',
      )}
    >
      {domain && (
        <span className="flex min-w-0 items-center gap-1.5">
          <DomainDot color={domain.color} />
          <span className="truncate text-xs text-muted-fg">{domain.label}</span>
        </span>
      )}

      <MarkdownInline className="line-clamp-4 text-sm text-card-fg">
        {card.front}
      </MarkdownInline>

      <CategoryChips
        ids={card.categoryIds}
        categories={categories}
        className="mt-auto pt-1"
      />
    </Link>
  )
}
