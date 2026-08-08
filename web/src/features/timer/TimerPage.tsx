import { Pause, Play, RotateCcw } from 'lucide-react'
import type { DomainId } from '../../api/types'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { DomainDot } from '../../components/ui/badge'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { clock } from '../../lib/date'
import { useDomains } from '../domains/queries'
import { useFocusTimer } from './TimerProvider'
import { DURATIONS } from './useTimer'

export default function TimerPage() {
  const timer = useFocusTimer()
  const { data: domains } = useDomains()
  const { status, durationMinutes, domainId } = timer

  const total = durationMinutes * 60_000
  const elapsed = Math.min(1, Math.max(0, 1 - timer.remainingMs / total))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Fokus"
        description="Sesi dengan awal dan akhir yang jelas. Selesai sesi, kamu ditanya apa yang barusan dipelajari."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="flex flex-col items-center gap-8 px-6 py-12">
          <TimerRing progress={elapsed} label={clock(timer.remainingMs)} />

          <div className="flex flex-wrap justify-center gap-3">
            {status === 'idle' && (
              <Button variant="primary" size="lg" onClick={timer.start}>
                <Play />
                Mulai
              </Button>
            )}
            {status === 'running' && (
              <>
                <Button variant="secondary" size="lg" onClick={timer.pause}>
                  <Pause />
                  Jeda
                </Button>
                <Button variant="ghost" size="lg" onClick={timer.reset}>
                  <RotateCcw />
                  Ulangi
                </Button>
              </>
            )}
            {status === 'paused' && (
              <>
                <Button variant="primary" size="lg" onClick={timer.resume}>
                  <Play />
                  Lanjut
                </Button>
                <Button variant="ghost" size="lg" onClick={timer.reset}>
                  <RotateCcw />
                  Ulangi
                </Button>
              </>
            )}
          </div>
        </Card>

        {status === 'idle' && (
          <div className="flex flex-col gap-6">
            <Choice
              label="Durasi"
              hint="Mulai pendek. Durasi naik sendiri kalau sesi pendek sudah kebiasaan."
            >
              <ToggleGroup>
                {DURATIONS.map((minutes) => (
                  <ToggleGroupItem
                    key={minutes}
                    selected={minutes === durationMinutes}
                    onClick={() => timer.setDuration(minutes)}
                  >
                    {minutes} menit
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Choice>

            {/*
              A domain is optional. It exists so the note captured at the end
              arrives already tagged (D-011) — not as a category the user is
              obliged to maintain.
            */}
            <Choice label="Domain">
              <ToggleGroup>
                <ToggleGroupItem
                  selected={domainId === null}
                  onClick={() => timer.setDomain(null)}
                >
                  Tanpa domain
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
          </div>
        )}
      </div>

      {timer.logFailed && (
        <Notice>
          Sesi belum tercatat.{' '}
          <button onClick={timer.retryLog} className="underline underline-offset-4">
            Coba lagi
          </button>
        </Notice>
      )}
    </div>
  )
}

/**
 * The clock face. A ring rather than a bar, from the mockup — it reads as time
 * passing rather than as a task bar filling toward a target.
 */
function TimerRing({ progress, label }: { progress: number; label: string }) {
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
          className="stroke-primary transition-[stroke-dashoffset] duration-(--animate-duration-calm) ease-(--ease-quiet)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-5xl font-semibold text-card-fg tabular-nums">
          {label}
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
