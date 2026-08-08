import { useState } from 'react'
import { ArrowLeft, Play } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Attempt, CardRef } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Notice } from '../../components/ui/notice'
import { Separator } from '../../components/ui/separator'
import { Loading } from '../../components/ui/spinner'
import { humanDay, today } from '../../lib/date'
import { useDomains } from '../domains/queries'
import {
  useArchiveExam,
  useDeleteExam,
  useExam,
  usePickableCards,
  useSetExamCards,
  useStartAttempt,
} from './queries'

export default function ExamPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: exam, isPending, error } = useExam(id)
  const { data: domains } = useDomains()

  const start = useStartAttempt()
  const archive = useArchiveExam()
  const del = useDeleteExam()

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>
  if (!exam) return null

  const domain = domains?.find((d) => d.id === exam.domainId)
  const open = exam.attempts.find((a) => a.finishedAt === null)
  const finished = exam.attempts.filter((a) => a.finishedAt !== null)

  function begin() {
    start.mutate(
      { examId: id, attemptDate: today() },
      { onSuccess: (attempt) => navigate(`/attempts/${attempt.id}`) },
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="link" size="inline" className="self-start">
          <Link to="/exams">
            <ArrowLeft />
            Semua ujian
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-surface-fg">
            {exam.title}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-fg">
            {exam.selection === 'random'
              ? `${exam.questionCount} soal acak`
              : 'soal tetap'}
            {domain && (
              <>
                <span aria-hidden>·</span>
                <DomainDot color={domain.color} />
                {domain.label}
              </>
            )}
          </p>
        </div>
      </div>

      {exam.description && (
        <p className="text-reading text-reading-fg">{exam.description}</p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          onClick={begin}
          disabled={start.isPending}
          className="self-start"
        >
          <Play />
          {open ? 'Lanjutkan' : 'Mulai'}
        </Button>
        {/*
          An unfinished attempt is picked up, not replaced. The server returns
          the same attempt with the same questions (D-050), so this is a plain
          statement of where things stand rather than a warning.
        */}
        {open && (
          <p className="text-sm text-muted-fg">Ada percobaan yang belum selesai.</p>
        )}
        {start.isError && <Notice>{start.error.message}</Notice>}
      </div>

      {exam.selection === 'fixed' && (
        <CardPicker examId={id} domainId={exam.domainId} pinned={exam.cards} />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-fg">Riwayat</h2>
        {finished.length === 0 ? (
          <p className="text-sm text-subtle-fg">Belum pernah dikerjakan.</p>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {finished.map((a) => (
                <AttemptRow key={a.id} attempt={a} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Button
            variant="link"
            size="inline"
            onClick={() => archive.mutate(id, { onSuccess: () => navigate('/exams') })}
          >
            Arsipkan
          </Button>
          <Button
            variant="link"
            size="inline"
            onClick={() => del.mutate(id, { onSuccess: () => navigate('/exams') })}
          >
            Hapus
          </Button>
        </div>

        {/*
          An exam that has been sat cannot be deleted: that would destroy its
          score history while the answers survive in review_logs (D-051). The
          server's message says to archive instead.
        */}
        {del.isError && <Notice>{del.error.message}</Notice>}
      </div>
    </div>
  )
}

/**
 * Pins the question set of a 'fixed' exam.
 *
 * Shows prompts only — the point of a fixed set is knowing what will be asked,
 * not reading the answers while choosing (D-003 in spirit).
 */
function CardPicker({
  examId,
  domainId,
  pinned,
}: {
  examId: string
  domainId: string | null
  pinned: CardRef[]
}) {
  const { data: candidates, isPending } = usePickableCards(domainId)
  const save = useSetExamCards()

  const [chosen, setChosen] = useState<string[]>(() =>
    pinned.map((c) => `${c.noteId}:${c.cardId}`),
  )

  function toggle(key: string) {
    setChosen((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  function submit() {
    save.mutate({
      examId,
      // Selection order is the order they will be asked in.
      cards: chosen.map((k) => {
        const [noteId, ...rest] = k.split(':')
        return { noteId, cardId: rest.join(':') }
      }),
    })
  }

  if (isPending) return <Loading label="Memuat kartu…" />

  const cards = candidates ?? []

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-fg">Soal</h2>
        <span className="text-xs text-subtle-fg tabular-nums">
          {chosen.length} dipilih
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-subtle-fg">
          Belum ada kartu yang bisa dipilih. Tulis beberapa kartu di catatan dulu.
        </p>
      ) : (
        <>
          <Card className="max-h-80 overflow-y-auto p-2">
            <ul className="flex flex-col gap-0.5">
              {cards.map((c) => {
                const key = `${c.noteId}:${c.cardId}`
                return (
                  <li key={key}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-sm text-secondary-fg hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={chosen.includes(key)}
                        onChange={() => toggle(key)}
                        className="mt-1 accent-primary"
                      />
                      <span className="flex-1">
                        {c.front}
                        <span className="ml-2 text-xs text-subtle-fg">
                          {c.noteTitle}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Button
            variant="secondary"
            onClick={submit}
            disabled={save.isPending}
            className="self-start"
          >
            Simpan daftar soal
          </Button>
          {save.isError && <Notice>{save.error.message}</Notice>}
        </>
      )}
    </section>
  )
}

function AttemptRow({ attempt }: { attempt: Attempt }) {
  return (
    <li className="flex items-baseline justify-between px-4 py-2.5">
      <span className="text-sm text-muted-fg">{humanDay(attempt.startedAt)}</span>
      {/*
        A plain ratio, no colour and no pass mark. There is no threshold to
        fall below here — the number is information about what to revisit, not
        a verdict (rule 6).
      */}
      <span className="text-sm text-card-fg tabular-nums">
        {attempt.correctCount} / {attempt.totalCount}
      </span>
    </li>
  )
}
