import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { DueCard, Rating } from '../../api/types'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { Loading } from '../../components/ui/spinner'
import { reviewKeys, useAnswer, useDueCards, useRate } from './queries'

export default function ReviewPage() {
  const { data, isPending, error } = useDueCards()
  const [index, setIndex] = useState(0)
  const qc = useQueryClient()

  // The due list is held still for the whole session so the deck cannot
  // reshuffle mid-review. Leaving the screen is when it becomes stale.
  useEffect(() => () => void qc.invalidateQueries({ queryKey: reviewKeys.due() }), [qc])

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  const cards = data?.cards ?? []
  const deferred = Math.max(0, (data?.total ?? 0) - cards.length)

  if (cards.length === 0) return <Finished deferred={deferred} nothingToday />
  if (index >= cards.length) return <Finished deferred={deferred} />

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-surface-fg">
          Ulangan
        </h1>
        <span className="text-sm text-subtle-fg tabular-nums">
          {index + 1} dari {cards.length}
        </span>
      </div>

      {/*
        A plain position bar, not a score and not a target. It says how far
        through today's cards you are and nothing else — there is no quota to
        fall short of (D-009, D-054).
      */}
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-(--animate-duration-calm) ease-(--ease-quiet)"
          style={{ width: `${(index / cards.length) * 100}%` }}
        />
      </div>

      <CardReview
        // Remounting per card resets the reveal state, which is what
        // guarantees the next prompt never arrives already answered.
        key={`${cards[index].noteId}:${cards[index].id}`}
        card={cards[index]}
        onRated={() => setIndex((i) => i + 1)}
      />
    </div>
  )
}

function CardReview({ card, onRated }: { card: DueCard; onRated: () => void }) {
  const [reveal, setReveal] = useState(false)
  const answer = useAnswer(card.noteId, card.id, reveal)
  const rate = useRate()

  function submit(rating: Rating) {
    rate.mutate({ noteId: card.noteId, cardId: card.id, rating }, { onSuccess: onRated })
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-10">
        <p className="text-reading text-card-fg">{card.front}</p>

        {/*
          Nothing about the answer exists here until the request resolves —
          no hidden element, no CSS-collapsed div, no data attribute. Recall
          before reveal is the mechanism the product rests on (D-003), and an
          answer that is merely hidden is defeated by one glance at the DOM.
        */}
        {reveal && (
          <div className="mt-6 border-t border-border pt-6">
            {answer.isPending && <Loading label="Membuka…" />}
            {answer.error && (
              <p className="text-sm text-muted-fg">{answer.error.message}</p>
            )}
            {answer.data && (
              <p className="text-reading text-reading-fg">{answer.data.back}</p>
            )}
          </div>
        )}
      </Card>

      {!reveal ? (
        <Button variant="primary" size="lg" onClick={() => setReveal(true)}>
          Tampilkan jawaban
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/*
            Both answers are ordinary. "Belum ingat" carries no red and no
            warning tone: forgetting is the normal case the entire schedule is
            built around, not a mistake to flag. The palette has no token that
            would let this go wrong (D-054).
          */}
          <Button
            variant="secondary"
            size="lg"
            onClick={() => submit('lupa')}
            disabled={rate.isPending || !answer.data}
          >
            Belum ingat
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => submit('ingat')}
            disabled={rate.isPending || !answer.data}
          >
            Ingat
          </Button>
        </div>
      )}

      {/* A card you could not answer leads back to where it came from. */}
      <Button asChild variant="link" size="inline" className="self-start">
        <Link to={`/notes/${card.noteId}`}>Lihat catatan asal</Link>
      </Button>

      {rate.isError && <Notice>{rate.error.message}</Notice>}
    </div>
  )
}

function Finished({ deferred, nothingToday }: { deferred: number; nothingToday?: boolean }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Ulangan" />

      {/*
        Calm, not congratulatory. No confetti and nothing to lose: an empty
        day is a normal day, and a streak that could break here is exactly
        what GOALS.md rules out.

        `deferred` is stated and left there. No "continue anyway" button: the
        cap exists so that coming back after two weeks away is ten cards and
        not forty, and a button to override it would quietly undo that (D-009).
      */}
      <EmptyState
        title={
          nothingToday
            ? 'Tidak ada yang perlu diulang hari ini.'
            : 'Selesai untuk hari ini.'
        }
        description={deferred > 0 ? 'Sisanya besok.' : undefined}
        action={
          <Button asChild variant="secondary" size="sm">
            <Link to="/notes">Ke catatan</Link>
          </Button>
        }
      />
    </div>
  )
}
