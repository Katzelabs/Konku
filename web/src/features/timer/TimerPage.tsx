import { useEffect, useRef } from 'react'
import type { DomainId } from '../../api/types'
import { clock, today } from '../../lib/date'
import CaptureDialog from './CaptureDialog'
import { useDomains } from '../domains/queries'
import { useLogSession } from './queries'
import { DURATIONS, useTimer } from './useTimer'

export default function TimerPage() {
  const timer = useTimer()
  const { data: domains } = useDomains()
  const logSession = useLogSession()

  const { status, logged, durationMinutes, domainId, markLogged } = timer

  // A finished session is recorded exactly once.
  //
  // Two guards, because they cover different things: `logged` is persisted, so
  // a refresh with the capture prompt still open does not log the same twenty
  // minutes again; the ref covers StrictMode's double effect pass in
  // development, which fires before the persisted flag has re-rendered.
  const sent = useRef(false)
  useEffect(() => {
    if (status !== 'done') {
      sent.current = false
      return
    }
    if (logged || sent.current) return
    sent.current = true
    markLogged()
    logSession.mutate({
      domainId,
      durationMinutes,
      // The client's local day, sent explicitly: a session finished at 23:50
      // belongs to that day, and the server may be hours away.
      sessionDate: today(),
    })
  }, [status, logged, domainId, durationMinutes, markLogged, logSession])

  const total = durationMinutes * 60_000
  const elapsed = Math.min(1, Math.max(0, 1 - timer.remainingMs / total))

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold text-slate-900">Fokus</h1>

      <div className="flex flex-col items-center gap-6 rounded-xl border border-slate-200 px-6 py-10">
        <p className="font-mono text-6xl tabular-nums text-slate-900">{clock(timer.remainingMs)}</p>

        <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-slate-800 transition-[width] duration-300"
            style={{ width: `${elapsed * 100}%` }}
          />
        </div>

        <div className="flex gap-3">
          {status === 'idle' && <Primary onClick={timer.start}>Mulai</Primary>}
          {status === 'running' && <Secondary onClick={timer.pause}>Jeda</Secondary>}
          {status === 'paused' && (
            <>
              <Primary onClick={timer.resume}>Lanjut</Primary>
              <Secondary onClick={timer.reset}>Ulangi</Secondary>
            </>
          )}
          {status === 'running' && <Secondary onClick={timer.reset}>Ulangi</Secondary>}
        </div>
      </div>

      {status === 'idle' && (
        <div className="flex flex-col gap-5">
          <Choice label="Durasi">
            {DURATIONS.map((minutes) => (
              <Chip
                key={minutes}
                selected={minutes === durationMinutes}
                onClick={() => timer.setDuration(minutes)}
              >
                {minutes} menit
              </Chip>
            ))}
          </Choice>

          {/*
            A domain is optional. It exists so the note captured at the end
            arrives already tagged (D-011) — not as a category the user is
            obliged to maintain, which is a v0.2 concern.
          */}
          <Choice label="Domain">
            <Chip selected={domainId === null} onClick={() => timer.setDomain(null)}>
              Tanpa domain
            </Chip>
            {domains?.map((domain) => (
              <Chip
                key={domain.id}
                selected={domainId === domain.id}
                onClick={() => timer.setDomain(domain.id as DomainId)}
              >
                {domain.label}
              </Chip>
            ))}
          </Choice>
        </div>
      )}

      {logSession.isError && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Sesi belum tercatat.{' '}
          <button
            onClick={() =>
              logSession.mutate({ domainId, durationMinutes, sessionDate: today() })
            }
            className="underline underline-offset-4"
          >
            Coba lagi
          </button>
        </p>
      )}

      {status === 'done' && <CaptureDialog domainId={domainId} onClose={timer.reset} />}
    </div>
  )
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={
        selected
          ? 'rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white'
          : 'rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-600'
      }
    >
      {children}
    </button>
  )
}

function Primary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg bg-slate-900 px-6 py-2.5 font-medium text-white"
    >
      {children}
    </button>
  )
}

function Secondary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-300 px-6 py-2.5 font-medium text-slate-700"
    >
      {children}
    </button>
  )
}
