import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { Loading } from '../../components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useDomains } from '../domains/queries'
import { CARD_LIMIT, useCards } from './queries'

/**
 * Every card, and the note it came from.
 *
 * A browser, not a deck manager. There is no import, no cover art, no mastery
 * percentage and no way to create a card here — a card is a `Tanya :: Jawab`
 * line inside a note, and the only place to write one is the note (D-054).
 * Every row leads back to its source, which is the point: if a card is wrong,
 * you fix the note.
 */
export default function CardsPage() {
  const [domainId, setDomainId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const { data: domains } = useDomains()
  const { data, isPending, error } = useCards(domainId)

  const cards = data ?? []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter(
      (c) =>
        c.front.toLowerCase().includes(q) ||
        c.noteTitle.toLowerCase().includes(q),
    )
  }, [cards, query])

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Kartu"
        description="Semua kartu yang sudah ditulis di catatan. Kartu dibuat dan diubah di catatannya, bukan di sini."
        meta={
          !isPending && (
            <span>
              {cards.length} kartu
              {domainId && ' di domain ini'}
            </span>
          )
        }
        actions={
          <Button asChild variant="secondary">
            <Link to="/review">Mulai ulangan</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-fg" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari isi kartu atau judul catatan…"
            className="pl-9"
          />
        </div>

        {domains && domains.length > 0 && (
          <ToggleGroup>
            <ToggleGroupItem
              selected={domainId === null}
              onClick={() => setDomainId(null)}
            >
              Semua
            </ToggleGroupItem>
            {domains.map((d) => (
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
          </ToggleGroup>
        )}
      </div>

      {isPending && <Loading />}
      {error && <Notice>{error.message}</Notice>}

      {data && cards.length === 0 && (
        <EmptyState
          title="Belum ada kartu."
          description="Kartu ditulis langsung di catatan dengan format Tanya :: Jawab."
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/notes">Ke catatan</Link>
            </Button>
          }
        />
      )}

      {cards.length > 0 && filtered.length === 0 && (
        <p className="py-4 text-sm text-muted-fg">Tidak ada kartu yang cocok.</p>
      )}

      {filtered.length > 0 && (
        <Card>
          <ul className="divide-y divide-border">
            {filtered.map((c) => (
              <li key={`${c.noteId}:${c.cardId}`}>
                <Link
                  to={`/notes/${c.noteId}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted"
                >
                  <span className="text-sm text-card-fg">{c.front}</span>
                  <span className="text-xs text-subtle-fg">{c.noteTitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/*
        Said plainly rather than paginated. The endpoint caps at 500 and the
        list is a browser, not a workflow — if this ever trips, paging is the
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
