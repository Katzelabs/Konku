import { useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Exam, ExamSelection } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { Loading } from '../../components/ui/spinner'
import { useDomains } from '../domains/queries'
import { useCreateExam, useExams } from './queries'

export default function ExamsPage() {
  const { data, isPending, error } = useExams()
  const [adding, setAdding] = useState(false)

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  const exams = data ?? []

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Ujian"
        description="Latihan dari kartu yang sudah ada di catatan. Hasilnya tidak mengubah jadwal ulangan — ini buat mengukur, bukan buat dihukum."
        actions={
          !adding && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus />
              Buat ujian
            </Button>
          )
        }
      />

      {adding && <NewExamForm onDone={() => setAdding(false)} />}

      {exams.length === 0 && !adding ? (
        <EmptyState
          title="Belum ada ujian."
          description="Buat satu kalau mau menguji diri di luar jadwal ulangan."
        />
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
      <Link to={`/exams/${exam.id}`} className="block">
        <Card className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-card-fg">{exam.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle-fg">
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
              {exam.attemptCount > 0 && ` · ${exam.attemptCount}× dikerjakan`}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-subtle-fg" />
        </Card>
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
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exam-title">Judul ujian</Label>
          <Input
            id="exam-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Latihan aljabar linear"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exam-domain">Domain</Label>
          <select
            id="exam-domain"
            value={domainId ?? ''}
            onChange={(e) => setDomainId(e.target.value || null)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm text-card-fg"
          >
            <option value="">Semua</option>
            {domains?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-surface-fg">Soal</legend>
          <label className="flex items-start gap-2 text-sm text-secondary-fg">
            <input
              type="radio"
              checked={selection === 'random'}
              onChange={() => setSelection('random')}
              className="mt-0.5 accent-primary"
            />
            Acak tiap kali dikerjakan
          </label>
          <label className="flex items-start gap-2 text-sm text-secondary-fg">
            <input
              type="radio"
              checked={selection === 'fixed'}
              onChange={() => setSelection('fixed')}
              className="mt-0.5 accent-primary"
            />
            Tetap — soalnya sama tiap kali, jadi skornya bisa dibandingkan
          </label>
        </fieldset>

        {selection === 'random' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exam-count">Jumlah soal</Label>
            <Input
              id="exam-count"
              type="number"
              min={1}
              max={100}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="w-24"
            />
          </div>
        )}

        {selection === 'fixed' && (
          <p className="text-xs text-muted-fg">
            Setelah disimpan, pilih kartunya di halaman ujian ini.
          </p>
        )}

        {create.isError && <Notice>{create.error.message}</Notice>}

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || !title.trim()}
          >
            Simpan
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            Batal
          </Button>
        </div>
      </form>
    </Card>
  )
}
