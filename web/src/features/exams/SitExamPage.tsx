import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { AttemptDetail, AttemptQuestion, Rating } from '../../api/types'
import {
  useAnswerQuestion,
  useAttempt,
  useAttemptAnswer,
  useFinishAttempt,
} from './queries'

/**
 * One sitting of an exam.
 *
 * Deliberately the same interaction as the review screen: prompt, reveal,
 * ingat/lupa. Nothing new to learn, and recall-before-reveal (D-003) applies
 * here for exactly the same reason it does there.
 *
 * There is no running score. A live tally during the sitting is a scoreboard,
 * and the score is only useful afterwards as a pointer to what to revisit.
 */
export default function SitExamPage() {
  const { id = '' } = useParams()
  const { data: attempt, isPending, error } = useAttempt(id)

  if (isPending) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) {
    return <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{error.message}</p>
  }
  if (!attempt) return null

  if (attempt.finishedAt !== null) return <Result attempt={attempt} />
  return <Sitting attempt={attempt} />
}

function Sitting({ attempt }: { attempt: AttemptDetail }) {
  // Resuming lands on the first unanswered question rather than the start, so
  // a run picked up later carries on where it stopped (D-050).
  const firstUnanswered = attempt.questions.findIndex((q) => q.rating === null)
  const [index, setIndex] = useState(firstUnanswered === -1 ? 0 : firstUnanswered)
  const finish = useFinishAttempt()

  const remaining = attempt.questions.filter((q) => q.rating === null).length
  const question = attempt.questions[index]

  if (remaining === 0 || !question) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-xl font-semibold text-slate-900">Selesai menjawab</h1>
        <p className="text-sm text-slate-600">Semua soal sudah dijawab.</p>
        <button
          onClick={() => finish.mutate(attempt.id)}
          disabled={finish.isPending}
          className="self-start rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-40"
        >
          Lihat hasil
        </button>
        {finish.isError && <p className="text-sm text-slate-600">{finish.error.message}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Ujian</h1>
        <span className="text-sm text-slate-400">
          Soal {index + 1} dari {attempt.questions.length}
        </span>
      </div>

      <Question
        // Remounting per question resets the reveal state, so the next prompt
        // can never arrive already showing its answer.
        key={`${question.noteId}:${question.cardId}`}
        attemptId={attempt.id}
        question={question}
        onAnswered={() => setIndex((i) => i + 1)}
      />
    </div>
  )
}

function Question({
  attemptId,
  question,
  onAnswered,
}: {
  attemptId: string
  question: AttemptQuestion
  onAnswered: () => void
}) {
  const [reveal, setReveal] = useState(false)
  const answer = useAttemptAnswer(attemptId, question.noteId, question.cardId, reveal)
  const submit = useAnswerQuestion()

  function rate(rating: Rating) {
    submit.mutate(
      { attemptId, noteId: question.noteId, cardId: question.cardId, rating },
      { onSuccess: onAnswered },
    )
  }

  // A card whose note was deleted after the draw still holds its place in the
  // score, but there is nothing left to ask.
  if (question.missing) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-slate-200 px-5 py-8">
          <p className="text-slate-500">Kartu ini sudah tidak ada.</p>
        </div>
        <button
          onClick={onAnswered}
          className="self-start rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700"
        >
          Lewati
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-slate-200 px-5 py-8">
        <p className="text-lg text-slate-900">{question.front}</p>

        {/*
          Nothing about the answer exists here until the request resolves — no
          hidden element and no collapsed div. An answer that is merely hidden
          is defeated by one glance at the DOM (D-003).
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
          {/* Both answers are ordinary. Forgetting carries no red. */}
          <button
            onClick={() => rate('lupa')}
            disabled={submit.isPending || !answer.data}
            className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 disabled:opacity-40"
          >
            Belum ingat
          </button>
          <button
            onClick={() => rate('ingat')}
            disabled={submit.isPending || !answer.data}
            className="rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-40"
          >
            Ingat
          </button>
        </div>
      )}

      {submit.isError && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {submit.error.message}
        </p>
      )}
    </div>
  )
}

function Result({ attempt }: { attempt: AttemptDetail }) {
  const missed = attempt.questions.filter((q) => q.rating === 'lupa')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Hasil</h1>

      {/*
        The number, stated plainly. No grade, no pass mark, no colour: there is
        nothing to fall below here, and the useful part is the list underneath
        it (rule 6).
      */}
      <div className="rounded-lg bg-slate-50 px-4 py-6">
        <p className="text-2xl text-slate-900">
          {attempt.correctCount} <span className="text-slate-400">/ {attempt.totalCount}</span>
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Ini tidak mengubah jadwal ulangan kartu-kartu ini.
        </p>
      </div>

      {missed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-slate-500">Yang belum nempel</h2>
          <ul className="flex flex-col gap-1">
            {missed.map((q) => (
              <li key={`${q.noteId}:${q.cardId}`}>
                <Link
                  to={`/notes/${q.noteId}`}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-700 odd:bg-slate-50"
                >
                  {q.front || 'Kartu ini sudah tidak ada.'}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        to={`/exams/${attempt.examId}`}
        className="self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
      >
        Kembali ke ujian
      </Link>
    </div>
  )
}
