import { ArrowRight, Play, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { Loading } from '../../components/ui/spinner'
import { humanDay } from '../../lib/date'
import { useDomains } from '../domains/queries'
import { useCreateNote, useRecentNotes } from '../notes/queries'
import { useDueCards } from '../review/queries'

/**
 * The landing screen.
 *
 * What it deliberately does not have: a streak, a daily target, a completion
 * percentage, a "you are on track" line, or a score. Every one of those was in
 * the Figma dashboard and every one is rejected (D-054, D-007, D-009). A home
 * screen that grades your day is the exact mechanic GOALS.md rules out.
 *
 * What is left is the honest version: what is waiting, a way to start, and
 * what you were last working on.
 */
export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Beranda"
        description="Mulai dari sini. Tidak ada target harian — cukup lanjutkan yang kemarin."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <DueToday />
        <StartSession />
        <QuickCapture />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <RecentNotes />
        <DomainList />
      </div>
    </div>
  )
}

function DueToday() {
  const { data, isPending, error } = useDueCards()
  const count = data?.cards.length ?? 0
  const deferred = Math.max(0, (data?.total ?? 0) - count)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ulangan hari ini</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending && <Loading />}
        {error && <Notice>{error.message}</Notice>}
        {data && (
          <>
            <p className="text-3xl font-semibold text-card-fg tabular-nums">
              {count}
              <span className="ml-1.5 text-sm font-normal text-subtle-fg">
                kartu
              </span>
            </p>
            {/*
              Stated and left there. No "continue anyway": the cap exists so
              that coming back after two weeks away is ten cards, not forty
              (D-009).
            */}
            <p className="text-sm text-muted-fg">
              {count === 0
                ? 'Tidak ada yang perlu diulang hari ini.'
                : deferred > 0
                  ? 'Sisanya besok.'
                  : 'Semuanya muat hari ini.'}
            </p>
            {count > 0 && (
              <Button asChild variant="primary" size="sm" className="self-start">
                {/* Straight into the queue, not the Ulangan index: this tile
                    already is the index's summary. */}
                <Link to="/review/due">
                  Mulai ulangan
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StartSession() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sesi fokus</CardTitle>
        <CardDescription>
          Mulai pendek. Selesai sesi, kamu ditanya apa yang barusan dipelajari.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="secondary" size="sm">
          <Link to="/timer">
            <Play />
            Buka timer
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function QuickCapture() {
  const create = useCreateNote()
  const navigate = useNavigate()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catatan baru</CardTitle>
        <CardDescription>Satu baris sudah cukup untuk mulai.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={create.isPending}
          onClick={() =>
            create.mutate({ contentMd: '' }, { onSuccess: (n) => navigate(`/notes/${n.id}`) })
          }
          className="self-start"
        >
          <Plus />
          {create.isPending ? 'Sebentar…' : 'Tulis catatan'}
        </Button>
        {create.isError && <Notice>{create.error.message}</Notice>}
      </CardContent>
    </Card>
  )
}

function RecentNotes() {
  // Six, asked for as six. Slicing an infinite list down to six would page
  // the whole collection into memory to render a corner of the home screen.
  const { data: recent = [], isPending, error } = useRecentNotes(6)
  const { data: domains } = useDomains()

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Catatan terakhir</CardTitle>
        <Button asChild variant="link" size="inline">
          <Link to="/notes">Semua catatan</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isPending && (
          <div className="px-5 pb-5">
            <Loading />
          </div>
        )}
        {error && (
          <div className="px-5 pb-5">
            <Notice>{error.message}</Notice>
          </div>
        )}
        {!isPending && !error && recent.length === 0 && (
          <div className="px-5 pb-5">
            <EmptyState
              title="Belum ada catatan."
              description="Mulai dari satu baris saja."
            />
          </div>
        )}
        {recent.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {recent.map((n) => {
              const domain = domains?.find((d) => d.id === n.domainId)
              return (
                <li key={n.id}>
                  <Link
                    to={`/notes/${n.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted"
                  >
                    {domain && <DomainDot color={domain.color} />}
                    <span className="min-w-0 flex-1 truncate text-sm text-card-fg">
                      {n.title || 'Tanpa judul'}
                    </span>
                    <span className="shrink-0 text-xs text-subtle-fg">
                      {humanDay(n.updatedAt)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function DomainList() {
  const { data: domains, isPending } = useDomains()

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Domain</CardTitle>
        <Button asChild variant="link" size="inline">
          <Link to="/settings">Atur</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {isPending && <Loading />}
        {domains?.length === 0 && (
          <p className="text-sm text-muted-fg">Belum ada domain.</p>
        )}
        {domains?.map((d) => (
          <div key={d.id} className="flex items-center gap-2.5">
            <DomainDot color={d.color} />
            <span className="min-w-0 flex-1 truncate text-sm text-card-fg">
              {d.label}
            </span>
            {/*
              The weekly quota is a direction marker, not a debt. No progress
              bar and no "0 of 3 done" — there is no session-history endpoint
              to count against it anyway, and a bar here would turn a marker
              into a target.
            */}
            <span className="shrink-0 text-xs text-subtle-fg">
              {d.weeklyQuota > 0 ? `${d.weeklyQuota}×/minggu` : 'di luar rotasi'}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
