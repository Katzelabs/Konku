import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Attempt, CardRef } from '../../api/types'
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

  if (isPending) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) {
    return <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{error.message}</p>
  }
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
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/exams" className="text-sm text-slate-500 underline underline-offset-4">
          Semua ujian
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{exam.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {exam.selection === 'random' ? `${exam.questionCount} soal acak` : 'soal tetap'}
          {domain && ` · ${domain.label}`}
        </p>
      </div>

      {exam.description && <p className="text-sm text-slate-700">{exam.description}</p>}

      <div className="flex flex-col gap-2">
        <button
          onClick={begin}
          disabled={start.isPending}
          className="self-start rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-40"
        >
          {open ? 'Lanjutkan' : 'Mulai'}
        </button>
        {/*
          An unfinished attempt is picked up, not replaced. The server returns
          the same attempt with the same questions (D-050), so this is a plain
          statement of where things stand rather than a warning.
        */}
        {open && <p className="text-sm text-slate-500">Ada percobaan yang belum selesai.</p>}
        {start.isError && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {start.error.message}
          </p>
        )}
      </div>

      {exam.selection === 'fixed' && (
        <CardPicker examId={id} domainId={exam.domainId} pinned={exam.cards} />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-500">Riwayat</h2>
        {finished.length === 0 ? (
          <p className="text-sm text-slate-400">Belum pernah dikerjakan.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {finished.map((a) => (
              <AttemptRow key={a.id} attempt={a} />
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <button
          onClick={() => archive.mutate(id, { onSuccess: () => navigate('/exams') })}
          className="underline underline-offset-4"
        >
          Arsipkan
        </button>
        <button
          onClick={() => del.mutate(id, { onSuccess: () => navigate('/exams') })}
          className="underline underline-offset-4"
        >
          Hapus
        </button>
      </div>

      {/*
        An exam that has been sat cannot be deleted: that would destroy its
        score history while the answers survive in review_logs (D-051). The
        server's message says to archive instead.
      */}
      {del.isError && <p className="text-xs text-slate-600">{del.error.message}</p>}
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

  const [chosen, setChosen] = useState<string[]>(
    () => pinned.map((c) => `${c.noteId}:${c.cardId}`),
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

  if (isPending) return <p className="text-sm text-slate-500">Memuat kartu…</p>

  const cards = candidates ?? []

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-500">Soal</h2>
        <span className="text-xs text-slate-400">{chosen.length} dipilih</span>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-slate-400">
          Belum ada kartu yang bisa dipilih. Tulis beberapa kartu di catatan dulu.
        </p>
      ) : (
        <>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {cards.map((c) => {
              const key = `${c.noteId}:${c.cardId}`
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={chosen.includes(key)}
                      onChange={() => toggle(key)}
                      className="mt-1"
                    />
                    <span className="flex-1">
                      {c.front}
                      <span className="ml-2 text-xs text-slate-400">{c.noteTitle}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <button
            onClick={submit}
            disabled={save.isPending}
            className="self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            Simpan daftar soal
          </button>
          {save.isError && <p className="text-sm text-slate-600">{save.error.message}</p>}
        </>
      )}
    </section>
  )
}

function AttemptRow({ attempt }: { attempt: Attempt }) {
  return (
    <li className="flex items-baseline justify-between rounded-lg px-3 py-2 odd:bg-slate-50">
      <span className="text-sm text-slate-600">{humanDay(attempt.startedAt)}</span>
      {/*
        A plain ratio, no colour and no pass mark. There is no threshold to
        fall below here — the number is information about what to revisit, not
        a verdict (rule 6).
      */}
      <span className="text-sm text-slate-900">
        {attempt.correctCount} / {attempt.totalCount}
      </span>
    </li>
  )
}
