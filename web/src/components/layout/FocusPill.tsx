import { Pause, Play } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFocusTimer } from '../../features/timer/TimerProvider'
import { useCopy } from '../../i18n'
import { clock } from '../../lib/date'

/**
 * The running session, visible from every screen.
 *
 * It lives in the top bar rather than floating over the page: a fixed pill in
 * the corner competes with whatever you are actually doing, and the top bar is
 * already the place you look to find out where you are. It hides on /timer,
 * where the full timer is the page.
 *
 * Idle shows nothing. There is no "you have not started a session today"
 * nudge — that is the guilt mechanic GOALS.md rules out.
 */
export function FocusPill() {
  // The pill names the *session*; the timer catalog names the clock, so
  // `timer.status.running` ("Berjalan") is not this word. Pause and resume are
  // that feature's own controls and are read across from it, so the pill and
  // the /timer screen cannot come to call one button two things.
  const copy = useCopy()
  const c = copy.common.nav
  const timer = useFocusTimer()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const running = timer.status === 'running' || timer.status === 'paused'
  if (!running || pathname === '/timer') return null

  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-focus py-1 pr-1 pl-3 text-focus-fg">
      <button
        onClick={() => navigate('/timer')}
        className="flex items-baseline gap-2"
        aria-label={c.openTimer}
      >
        <span className="font-mono text-sm font-semibold tabular-nums">
          {clock(timer.remainingMs)}
        </span>
        <span className="hidden text-[10px] tracking-wide text-focus-muted-fg uppercase lg:inline">
          {timer.status === 'paused' ? copy.timer.status.paused : c.focus}
        </span>
      </button>

      <button
        onClick={timer.status === 'running' ? timer.pause : timer.resume}
        aria-label={
          timer.status === 'running'
            ? copy.timer.controls.pause
            : copy.timer.controls.resume
        }
        className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-fg transition-colors hover:bg-primary/90"
      >
        {timer.status === 'running' ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5" />
        )}
      </button>
    </div>
  )
}
