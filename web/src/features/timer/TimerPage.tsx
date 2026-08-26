import { Pause, Play, RotateCcw } from 'lucide-react'
import type { DomainId } from '../../api/types'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { DomainDot } from '../../components/ui/badge'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useCopy } from '../../i18n'
import { clock } from '../../lib/date'
import { useDateFormat } from '../../lib/useDateFormat'
import { cn } from '../../lib/utils'
import { useDomains } from '../domains/queries'
import { SessionLog } from './SessionLog'
import { useFocusTimer } from './TimerProvider'
import { DURATIONS } from './useTimer'

export default function TimerPage() {
  const c = useCopy().timer
  const timer = useFocusTimer()
  const { data: domains } = useDomains()
  const { status, durationMinutes, domainId } = timer

  const total = durationMinutes * 60_000
  const elapsed = Math.min(1, Math.max(0, 1 - timer.remainingMs / total))
  const running = status === 'running' || status === 'paused'

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={c.title} description={c.description} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="flex flex-col items-center gap-8 px-6 py-12">
          <TimerRing
            progress={elapsed}
            label={clock(timer.remainingMs)}
            status={c.status[status]}
            dimmed={status === 'paused'}
          />

          <div className="flex flex-wrap justify-center gap-3">
            {status === 'idle' && (
              <Button variant="primary" size="lg" onClick={timer.start}>
                <Play />
                {c.controls.start}
              </Button>
            )}
            {status === 'running' && (
              <>
                <Button variant="secondary" size="lg" onClick={timer.pause}>
                  <Pause />
                  {c.controls.pause}
                </Button>
                <Button variant="ghost" size="lg" onClick={timer.reset}>
                  <RotateCcw />
                  {c.controls.reset}
                </Button>
              </>
            )}
            {status === 'paused' && (
              <>
                <Button variant="primary" size="lg" onClick={timer.resume}>
                  <Play />
                  {c.controls.resume}
                </Button>
                <Button variant="ghost" size="lg" onClick={timer.reset}>
                  <RotateCcw />
                  {c.controls.reset}
                </Button>
              </>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          {status === 'idle' && (
            <>
              <Choice label={c.duration} hint={c.durationHint}>
                <ToggleGroup>
                  {DURATIONS.map((minutes) => (
                    <ToggleGroupItem
                      key={minutes}
                      selected={minutes === durationMinutes}
                      onClick={() => timer.setDuration(minutes)}
                    >
                      {c.minutes(minutes)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Choice>

              {/*
                A domain is optional. It exists so the note captured at the end
                arrives already tagged (D-011) — not as a category the user is
                obliged to maintain.
              */}
              <Choice label={c.domain}>
                <ToggleGroup>
                  <ToggleGroupItem
                    selected={domainId === null}
                    onClick={() => timer.setDomain(null)}
                  >
                    {c.noDomain}
                  </ToggleGroupItem>
                  {domains?.map((domain) => (
                    <ToggleGroupItem
                      key={domain.id}
                      selected={domainId === domain.id}
                      onClick={() => timer.setDomain(domain.id as DomainId)}
                      className="inline-flex items-center gap-1.5"
                    >
                      <DomainDot color={domain.color} />
                      {domain.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Choice>
            </>
          )}

          {running && <RunningSummary />}
        </div>
      </div>

      {timer.logFailed && (
        <Notice>
          {c.logFailed}{' '}
          <button onClick={timer.retryLog} className="underline underline-offset-4">
            {c.retry}
          </button>
        </Notice>
      )}

      <SessionLog />
    </div>
  )
}

/**
 * What the running session was set to.
 *
 * The settings disappear once a session starts — duration and domain are fixed
 * for its lifetime — and the column was simply left empty. This puts the same
 * facts back in a form you cannot fiddle with, which is also the point: the
 * decision was made at the start, and re-opening it mid-session is the
 * distraction the timer exists to close off.
 */
function RunningSummary() {
  const c = useCopy().timer
  const timer = useFocusTimer()
  const d = useDateFormat()
  const { data: domains } = useDomains()
  const domain = domains?.find((candidate) => candidate.id === timer.domainId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.summary.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 text-sm">
        <Row label={c.duration} value={c.minutes(timer.durationMinutes)} />
        <Row
          label={c.domain}
          value={
            domain ? (
              <span className="inline-flex items-center gap-1.5">
                <DomainDot color={domain.color} />
                {domain.label}
              </span>
            ) : (
              c.noDomain
            )
          }
        />
        {/*
          Only while running. Paused has no end time — it ends when you come
          back, and inventing one would be a deadline the product does not set.
        */}
        {timer.status === 'running' && (
          <Row
            label={c.summary.endsAround}
            value={d.timeOfDay(new Date(Date.now() + timer.remainingMs).toISOString())}
          />
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-fg">{label}</span>
      <span className="text-card-fg">{value}</span>
    </div>
  )
}

/**
 * The clock face. A ring rather than a bar, from the mockup — it reads as time
 * passing rather than as a task bar filling toward a target.
 */
function TimerRing({
  progress,
  label,
  status,
  dimmed,
}: {
  progress: number
  label: string
  status: string
  dimmed: boolean
}) {
  const radius = 130
  const stroke = 12
  const r = radius - stroke / 2
  const circumference = 2 * Math.PI * r

  return (
    <div className="relative" style={{ width: radius * 2, height: radius * 2 }}>
      <svg
        width={radius * 2}
        height={radius * 2}
        viewBox={`0 0 ${radius * 2} ${radius * 2}`}
        aria-hidden
        className="-rotate-90"
      >
        <circle
          cx={radius}
          cy={radius}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={radius}
          cy={radius}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className={cn(
            'stroke-primary-ink transition-[stroke-dashoffset,stroke] duration-(--animate-duration-calm) ease-(--ease-quiet)',
            // Paused reads as "waiting", not as an error. The arc steps back
            // rather than changing colour — there is no warning tone in this
            // palette and pausing is not something to be warned about.
            dimmed && 'stroke-primary-ink/35',
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        <span className="font-mono text-5xl font-semibold text-card-fg tabular-nums">
          {label}
        </span>
        <span
          role="status"
          className="text-[10px] tracking-wide text-subtle-fg uppercase"
        >
          {status}
        </span>
      </div>
    </div>
  )
}

function Choice({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-surface-fg">{label}</span>
      {hint && <p className="text-xs text-muted-fg">{hint}</p>}
      {children}
    </div>
  )
}
