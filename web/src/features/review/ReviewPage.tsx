import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { DueCard, Rating } from '../../api/types'
import { reviewKeys, useAnswer, useDueCards, useRate } from './queries'

export default function ReviewPage() {
  const { data, isPending, error } = useDueCards()
  const [index, setIndex] = useState(0)
  const qc = useQueryClient()

  // The due list is held still for the whole session so the deck cannot
  // reshuffle mid-review. Leaving the screen is when it becomes stale.
  useEffect(() => () => void qc.invalidateQueries({ queryKey: reviewKeys.due() }), [qc])

  if (isPending) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) {
    return <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{error.message}</p>
  }

  const cards = data?.cards ?? []
  const deferred = Math.max(0, (data?.total ?? 0) - cards.length)

  if (cards.length === 0) return <Finished deferred={deferred} nothingToday />
  if (index >= cards.length) return <Finished deferred={deferred} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Ulangan</h1>
        <span className="text-sm text-slate-400">
          {index + 1} dari {cards.length}
        </span>
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
      <div className="rounded-xl border border-slate-200 px-5 py-8">
        <p className="text-lg text-slate-900">{card.front}</p>

        {/*
          Nothing about the answer exists here until the request resolves —
          no hidden element, no CSS-collapsed div, no data attribute. Recall
          before reveal is the mechanism the product rests on (D-003), and an
          answer that is merely hidden is defeated by one glance at the DOM.
        */}
        {reveal && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            {answer.isPending && <p className="text-sm text-slate-400">Membuka…</p>}
            {answer.error && <p className="text-sm text-slate-500">{answer.error.message}</p>}
            {answer.data && <p className="text-lg text-slate-700">{answer.data.back}</p>}
          </div>
        )}
      </div>

      {!reveal ? (
        <button
          onClick={() => setReveal(true)}
          className="rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white"
        >
          Tampilkan jawaban
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/*
            Both answers are ordinary. "Belum ingat" carries no red and no
            warning tone: forgetting is the normal case the entire schedule is
            built around, not a mistake to flag.
          */}
          <button
            onClick={() => submit('lupa')}
            disabled={rate.isPending || !answer.data}
            className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 disabled:opacity-40"
          >
            Belum ingat
          </button>
          <button
            onClick={() => submit('ingat')}
            disabled={rate.isPending || !answer.data}
            className="rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-40"
          >
            Ingat
          </button>
        </div>
      )}

      {/* A card you could not answer leads back to where it came from. */}
      <Link
        to={`/notes/${card.noteId}`}
        className="self-start text-sm text-slate-500 underline underline-offset-4"
      >
        Lihat catatan asal
      </Link>

      {rate.isError && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{rate.error.message}</p>
      )}
    </div>
  )
}

function Finished({ deferred, nothingToday }: { deferred: number; nothingToday?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Ulangan</h1>

      {/*
        Calm, not congratulatory. No confetti and nothing to lose: an empty
        day is a normal day, and a streak that could break here is exactly
        what GOALS.md rules out.
      */}
      <div className="rounded-lg bg-slate-50 px-4 py-6">
        <p className="text-slate-700">
          {nothingToday ? 'Tidak ada yang perlu diulang hari ini.' : 'Selesai untuk hari ini.'}
        </p>
        {deferred > 0 && (
          /*
            Stated plainly and left there. No button to carry on: the cap
            exists so that coming back after two weeks away is ten cards and
            not forty, and an "continue anyway" button would quietly undo it
            (D-009).
          */
          <p className="mt-1 text-sm text-slate-500">Sisanya besok.</p>
        )}
      </div>

      <Link
        to="/notes"
        className="self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
      >
        Ke catatan
      </Link>
    </div>
  )
}
