import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Exam, ExamSelection } from '../../api/types'
import { useDomains } from '../domains/queries'
import { useCreateExam } from './queries'
import { useExams } from './queries'

export default function ExamsPage() {
  const { data, isPending, error } = useExams()
  const [adding, setAdding] = useState(false)

  if (isPending) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) {
    return <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{error.message}</p>
  }

  const exams = data ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Ujian</h1>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-sm text-slate-500 underline underline-offset-4"
          >
            Buat ujian
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500">
        Latihan dari kartu yang sudah ada di catatan. Hasilnya tidak mengubah jadwal ulangan — ini
        buat mengukur, bukan buat dihukum.
      </p>

      {adding && <NewExamForm onDone={() => setAdding(false)} />}

      {exams.length === 0 && !adding ? (
        <div className="rounded-lg bg-slate-50 px-4 py-6">
          <p className="text-slate-700">Belum ada ujian.</p>
          <p className="mt-1 text-sm text-slate-500">
            Buat satu kalau mau menguji diri di luar jadwal ulangan.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {exams.map((e) => (
            <ExamRow key={e.id} exam={e} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ExamRow({ exam }: { exam: Exam }) {
  const { data: domains } = useDomains()
  const domain = domains?.find((d) => d.id === exam.domainId)

  return (
    <li>
      <Link
        to={`/exams/${exam.id}`}
        className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"
      >
        <div className="flex-1">
          <p className="text-sm text-slate-900">{exam.title}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {exam.selection === 'random'
              ? `${exam.questionCount} soal acak`
              : 'soal tetap'}
            {domain && ` · ${domain.label}`}
            {exam.attemptCount > 0 && ` · ${exam.attemptCount}× dikerjakan`}
          </p>
        </div>
      </Link>
    </li>
  )
}

function NewExamForm({ onDone }: { onDone: () => void }) {
  const { data: domains } = useDomains()
  const create = useCreateExam()

  const [title, setTitle] = useState('')
  const [domainId, setDomainId] = useState<string | null>(null)
  const [selection, setSelection] = useState<ExamSelection>('random')
  const [questionCount, setQuestionCount] = useState(10)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    create.mutate(
      {
        title: title.trim(),
        domainId,
        selection,
        questionCount: selection === 'random' ? questionCount : null,
        timeLimitMinutes: null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Judul ujian"
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      <label className="flex items-center gap-2 text-sm text-slate-600">
        Domain
        <select
          value={domainId ?? ''}
          onChange={(e) => setDomainId(e.target.value || null)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">Semua</option>
          {domains?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-slate-600">Soal</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            checked={selection === 'random'}
            onChange={() => setSelection('random')}
          />
          Acak tiap kali dikerjakan
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            checked={selection === 'fixed'}
            onChange={() => setSelection('fixed')}
          />
          Tetap — soalnya sama tiap kali, jadi skornya bisa dibandingkan
        </label>
      </fieldset>

      {selection === 'random' && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Jumlah soal
          <input
            type="number"
            min={1}
            max={100}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
      )}

      {selection === 'fixed' && (
        <p className="text-xs text-slate-500">
          Setelah disimpan, pilih kartunya di halaman ujian ini.
        </p>
      )}

      {create.isError && <p className="text-sm text-slate-600">{create.error.message}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || !title.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Simpan
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
        >
          Batal
        </button>
      </div>
    </form>
  )
}
