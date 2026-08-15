import { useState } from 'react'
import { ArrowLeft, Play } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CardRef, Run } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Notice } from '../../components/ui/notice'
import { Separator } from '../../components/ui/separator'
import { LoadMore } from '../../components/ui/load-more'
import { Loading } from '../../components/ui/spinner'
import { humanDay, today } from '../../lib/date'
import { useCategories } from '../categories/queries'
import { useDomains } from '../domains/queries'
import {
  useArchiveReviewSet,
  useDeleteReviewSet,
  usePickableCards,
  useReviewSet,
  useSetReviewSetCards,
  useSetRuns,
  useStartRun,
} from './setQueries'

export default function ReviewSetPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: set, isPending, error } = useReviewSet(id)
  const { data: domains } = useDomains()
  const { data: categories } = useCategories()

  const start = useStartRun()
  const archive = useArchiveReviewSet()
  const del = useDeleteReviewSet()

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>
  if (!set) return null

  const pickedDomains = domains?.filter((d) => set.domainIds.includes(d.id)) ?? []
  const pickedCategories =
    categories?.filter((c) => set.categoryIds.includes(c.id)) ?? []
  // Read off the set rather than found by scanning the history for a run with
  // no finishedAt. The history is one page of finished sittings now, so that
  // search would have been asking a page a question only the set can answer.
  const open = set.openRun

  function begin() {
    start.mutate(
      { setId: id, runDate: today() },
      { onSuccess: (run) => navigate(`/review/runs/${run.id}`) },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="link" size="inline" className="self-start">
          <Link to="/review">
            <ArrowLeft />
            Semua ulangan
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-surface-fg">
            {set.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-fg">
            {set.selection === 'random'
              ? `${set.questionCount} soal acak`
              : 'soal tetap'}
            <span aria-hidden>·</span>
            {set.format === 'choice' ? 'pilihan ganda' : 'ingat sendiri'}
            {pickedDomains.map((d) => (
              <span key={d.id} className="flex items-center gap-1">
                <span aria-hidden>·</span>
                <DomainDot color={d.color} />
                {d.label}
              </span>
            ))}
            {pickedCategories.map((c) => (
              <span key={c.id}>
                <span aria-hidden> · </span>
                {c.label}
              </span>
            ))}
          </p>
        </div>
      </div>

      {set.description && (
        <p className="text-reading text-reading-fg">{set.description}</p>
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
          An unfinished run is picked up, not replaced. The server returns the
          same run with the same questions and the same options (D-050), so
          this is a plain statement of where things stand, not a warning.
        */}
        {open && (
          <p className="text-sm text-muted-fg">Ada percobaan yang belum selesai.</p>
        )}
        {start.isError && <Notice>{start.error.message}</Notice>}
      </div>

      {set.selection === 'fixed' && (
        <CardPicker setId={id} domainIds={set.domainIds} pinned={set.cards} />
      )}

      <RunHistory setId={id} />

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Button
            variant="link"
            size="inline"
            onClick={() =>
              archive.mutate(
                { id, archived: true },
                { onSuccess: () => navigate('/review') },
              )
            }
          >
            Arsipkan
          </Button>
          <Button
            variant="link"
            size="inline"
            onClick={() => del.mutate(id, { onSuccess: () => navigate('/review') })}
          >
            Hapus
          </Button>
        </div>

        {/*
          A set that has been run cannot be deleted: that would destroy its
          score history while the answers survive in review_logs (D-051). The
          server's message says to archive instead.
        */}
        {del.isError && <Notice>{del.error.message}</Notice>}
      </div>
    </div>
  )
}

/**
 * Pins the question set of a 'fixed' set.
 *
 * Shows prompts only — the point of a fixed set is knowing what will be asked,
 * not reading the answers while choosing (D-003 in spirit).
 */
function CardPicker({
  setId,
  domainIds,
  pinned,
}: {
  setId: string
  domainIds: string[]
  pinned: CardRef[]
}) {
  const {
    cards,
    total,
    isPending,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = usePickableCards(domainIds)
  const save = useSetReviewSetCards()

  const [chosen, setChosen] = useState<string[]>(() => pinned.map((c) => c.cardId))

  function toggle(key: string) {
    setChosen((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  function submit() {
    save.mutate({
      setId,
      // Selection order is the order they will be asked in.
      cards: chosen.map((cardId) => ({ cardId })),
    })
  }

  if (isPending) return <Loading label="Memuat kartu…" />

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-fg">Soal</h2>
        {/*
          What is chosen, out of what exists — not out of what is loaded. The
          picker read the first 500 cards as if they were all of them (D-084).
        */}
        <span className="text-xs text-subtle-fg tabular-nums">
          {chosen.length} dipilih dari {total}
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-subtle-fg">
          Belum ada kartu yang bisa dipilih. Buat beberapa kartu dulu.
        </p>
      ) : (
        <>
          <Card className="max-h-80 overflow-y-auto p-2">
            <ul className="flex flex-col gap-0.5">
              {cards.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-sm text-secondary-fg hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={chosen.includes(c.id)}
                      onChange={() => toggle(c.id)}
                      className="mt-1 accent-primary"
                    />
                    <span className="flex-1">{c.front}</span>
                  </label>
                </li>
              ))}
            </ul>

            <LoadMore
              loaded={cards.length}
              total={total}
              hasMore={Boolean(hasNextPage)}
              loading={isFetchingNextPage}
              error={error}
              onLoadMore={() => fetchNextPage()}
              noun="kartu"
              className="px-0 pb-1"
            />
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

/**
 * The finished sittings, newest first, one page at a time.
 *
 * It used to be twenty rows embedded in the set detail, drawn by a query with
 * a hardcoded limit and no offset — so the twenty-first sitting of a set was
 * counted in the header, written to the export, and unreachable. The heading
 * states the real count for the same reason the index headers do (D-084): a
 * screen that reports the length of what it loaded describes its own
 * truncation.
 */
function RunHistory({ setId }: { setId: string }) {
  const {
    runs,
    total,
    isPending,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useSetRuns(setId)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-fg">Riwayat</h2>
        {total > 0 && (
          <span className="text-xs text-subtle-fg tabular-nums">
            {total}× dikerjakan
          </span>
        )}
      </div>

      {isPending && <Loading />}

      {/*
        A failed first page is the only one that leaves nothing to show. A
        later one keeps its rows and reports itself under the list.
      */}
      {error && runs.length === 0 && <Notice>{error.message}</Notice>}

      {!isPending && !error && runs.length === 0 && (
        <p className="text-sm text-subtle-fg">Belum pernah dikerjakan.</p>
      )}

      {runs.length > 0 && (
        <>
          <Card>
            <ul className="divide-y divide-border">
              {runs.map((a) => (
                <RunRow key={a.id} run={a} />
              ))}
            </ul>
          </Card>

          <LoadMore
            loaded={runs.length}
            total={total}
            hasMore={Boolean(hasNextPage)}
            loading={isFetchingNextPage}
            error={error}
            onLoadMore={() => fetchNextPage()}
            noun="percobaan"
          />
        </>
      )}
    </section>
  )
}

function RunRow({ run }: { run: Run }) {
  return (
    <li className="flex items-baseline justify-between px-4 py-2.5">
      <span className="text-sm text-muted-fg">{humanDay(run.startedAt)}</span>
      {/*
        A plain ratio, no colour and no pass mark. There is no threshold to
        fall below here — the number is information about what to revisit, not
        a verdict (rule 6).
      */}
      <span className="text-sm text-card-fg tabular-nums">
        {run.correctCount} / {run.totalCount}
      </span>
    </li>
  )
}
