import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { AnswerResult, Rating, RunDetail, RunQuestion } from '../../api/types'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { Loading } from '../../components/ui/spinner'
import { cn } from '../../lib/utils'
import {
  useAnswerQuestion,
  useFinishRun,
  useRun,
  useRunAnswer,
} from './setQueries'

/**
 * One sitting of a review set.
 *
 * A recall question is deliberately the same interaction as the due queue:
 * prompt, reveal, ingat/lupa. Nothing new to learn, and recall-before-reveal
 * (D-003) applies here for exactly the same reason it does there.
 *
 * A choice question has no separate reveal step, and that is not a shortcut:
 * committing to an option *is* the recall attempt D-003 protects. The reveal
 * arrives on the response, once the answer is already given and cannot be
 * changed.
 *
 * There is no running score. A live tally during the sitting is a scoreboard,
 * and the score is only useful afterwards as a pointer to what to revisit.
 */
export default function RunPage() {
  const { id = '' } = useParams()
  const { data: run, isPending, error } = useRun(id)

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>
  if (!run) return null

  if (run.finishedAt !== null) return <Result run={run} />
  return <Sitting run={run} />
}

function Sitting({ run }: { run: RunDetail }) {
  // Resuming lands on the first unanswered question rather than the start, so
  // a run picked up later carries on where it stopped (D-050).
  const firstUnanswered = run.questions.findIndex((q) => q.rating === null)
  const [index, setIndex] = useState(firstUnanswered === -1 ? 0 : firstUnanswered)
  const finish = useFinishRun()

  const remaining = run.questions.filter((q) => q.rating === null).length
  const question = run.questions[index]

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
          onClick={() => finish.mutate(run.id)}
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
        <h1 className="text-2xl font-bold tracking-tight text-surface-fg">Ulangan</h1>
        <span className="text-sm text-subtle-fg tabular-nums">
          Soal {index + 1} dari {run.questions.length}
        </span>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-(--animate-duration-calm) ease-(--ease-quiet)"
          style={{ width: `${(index / run.questions.length) * 100}%` }}
        />
      </div>

      <Question
        // Remounting per question resets the reveal and the chosen option, so
        // the next prompt can never arrive already answered.
        key={question.cardId}
        runId={run.id}
        question={question}
        onAnswered={() => setIndex((i) => i + 1)}
      />
    </div>
  )
}

function Question({
  runId,
  question,
  onAnswered,
}: {
  runId: string
  question: RunQuestion
  onAnswered: () => void
}) {
  // A card deleted after the draw still holds its place in the score, but
  // there is nothing left to ask.
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

  if (question.options.length > 0) {
    return <ChoiceQuestion runId={runId} question={question} onAnswered={onAnswered} />
  }
  return <RecallQuestion runId={runId} question={question} onAnswered={onAnswered} />
}

function RecallQuestion({
  runId,
  question,
  onAnswered,
}: {
  runId: string
  question: RunQuestion
  onAnswered: () => void
}) {
  const [reveal, setReveal] = useState(false)
  const answer = useRunAnswer(runId, question.cardId, reveal)
  const submit = useAnswerQuestion()

  function rate(rating: Rating) {
    submit.mutate({ runId, cardId: question.cardId, rating }, { onSuccess: onAnswered })
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

/**
 * A multiple-choice question.
 *
 * Picking an option submits it. Grading happens on the server — the client is
 * never told which option is right until it has sent one, so the answer key is
 * not sitting in the page waiting to be read (D-077).
 */
function ChoiceQuestion({
  runId,
  question,
  onAnswered,
}: {
  runId: string
  question: RunQuestion
  onAnswered: () => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const submit = useAnswerQuestion()

  function choose(choice: number) {
    if (result) return
    setPicked(choice)
    submit.mutate(
      { runId, cardId: question.cardId, choice },
      { onSuccess: setResult },
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-8">
        <p className="text-reading text-card-fg">{question.front}</p>
      </Card>

      <ul className="flex flex-col gap-2">
        {question.options.map((option, i) => {
          const isCorrect = result !== null && result.correctIndex === i
          const isWrongPick = result !== null && picked === i && !isCorrect
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => choose(i)}
                disabled={result !== null || submit.isPending}
                className={cn(
                  'w-full rounded-md border px-4 py-3 text-left text-sm transition-colors',
                  'border-input bg-card text-card-fg',
                  result === null && 'hover:bg-muted',
                  // The right answer is marked with the primary token, not a
                  // green one — the palette has no success colour on purpose
                  // (D-054). A wrong pick is merely dimmed: getting it wrong is
                  // the ordinary case the whole schedule is built around.
                  isCorrect && 'border-primary-ink bg-primary/10 text-card-fg',
                  isWrongPick && 'border-border bg-muted text-muted-fg line-through',
                )}
              >
                {option}
              </button>
            </li>
          )
        })}
      </ul>

      {result !== null && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-fg">
            {result.rating === 'ingat' ? 'Betul.' : 'Belum kena — jawabannya yang ditandai.'}
          </p>
          <Button variant="primary" size="lg" onClick={onAnswered} className="self-start">
            Lanjut
          </Button>
        </div>
      )}

      {submit.isError && <Notice>{submit.error.message}</Notice>}
    </div>
  )
}

function Result({ run }: { run: RunDetail }) {
  const missed = run.questions.filter((q) => q.rating === 'lupa')

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
          {run.correctCount}
          <span className="text-subtle-fg"> / {run.totalCount}</span>
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
                <li key={q.cardId}>
                  <Link
                    to={`/cards/${q.cardId}`}
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
        <Link to={`/review/sets/${run.setId}`}>
          <ArrowLeft />
          Kembali ke latihan
        </Link>
      </Button>
    </div>
  )
}
