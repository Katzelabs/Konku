import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { AttemptDetail, AttemptQuestion, Rating } from '../../api/types'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { Loading } from '../../components/ui/spinner'
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

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>
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
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <PageHeader
          title="Selesai menjawab"
          description="Semua soal sudah dijawab."
        />
        <Button
          variant="primary"
          size="lg"
          onClick={() => finish.mutate(attempt.id)}
          disabled={finish.isPending}
          className="self-start"
        >
          Lihat hasil
        </Button>
        {finish.isError && <Notice>{finish.error.message}</Notice>}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-surface-fg">Ujian</h1>
        <span className="text-sm text-subtle-fg tabular-nums">
          Soal {index + 1} dari {attempt.questions.length}
        </span>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-(--animate-duration-calm) ease-(--ease-quiet)"
          style={{ width: `${(index / attempt.questions.length) * 100}%` }}
        />
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
        <Card className="px-6 py-10">
          <p className="text-muted-fg">Kartu ini sudah tidak ada.</p>
        </Card>
        <Button variant="secondary" size="lg" onClick={onAnswered} className="self-start">
          Lewati
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-10">
        <p className="text-reading text-card-fg">{question.front}</p>

        {/*
          Nothing about the answer exists here until the request resolves — no
          hidden element and no collapsed div. An answer that is merely hidden
          is defeated by one glance at the DOM (D-003).
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
          {/* Both answers are ordinary. Forgetting carries no red (D-054). */}
          <Button
            variant="secondary"
            size="lg"
            onClick={() => rate('lupa')}
            disabled={submit.isPending || !answer.data}
          >
            Belum ingat
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => rate('ingat')}
            disabled={submit.isPending || !answer.data}
          >
            Ingat
          </Button>
        </div>
      )}

      {submit.isError && <Notice>{submit.error.message}</Notice>}
    </div>
  )
}

function Result({ attempt }: { attempt: AttemptDetail }) {
  const missed = attempt.questions.filter((q) => q.rating === 'lupa')

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Hasil" />

      {/*
        The number, stated plainly. No grade, no pass mark, no colour: there is
        nothing to fall below here, and the useful part is the list underneath
        it (rule 6). The mockup's letter grades and green/red readiness chips
        are exactly what this refuses to be (D-054).
      */}
      <Card className="px-6 py-8">
        <p className="text-3xl font-semibold text-card-fg tabular-nums">
          {attempt.correctCount}
          <span className="text-subtle-fg"> / {attempt.totalCount}</span>
        </p>
        <p className="mt-2 text-sm text-muted-fg">
          Ini tidak mengubah jadwal ulangan kartu-kartu ini.
        </p>
      </Card>

      {missed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-fg">Yang belum nempel</h2>
          <Card>
            <ul className="divide-y divide-border">
              {missed.map((q) => (
                <li key={`${q.noteId}:${q.cardId}`}>
                  <Link
                    to={`/notes/${q.noteId}`}
                    className="block px-4 py-3 text-sm text-secondary-fg transition-colors hover:bg-muted"
                  >
                    {q.front || 'Kartu ini sudah tidak ada.'}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <Button asChild variant="secondary" className="self-start">
        <Link to={`/exams/${attempt.examId}`}>
          <ArrowLeft />
          Kembali ke ujian
        </Link>
      </Button>
    </div>
  )
}
