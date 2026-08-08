import { Clock, Pause, Play } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFocusTimer } from '../../features/timer/TimerProvider'
import { clock } from '../../lib/date'

/**
 * The running session, visible from every screen.
 *
 * Taken from the mockup, and the best idea in it: without this the timer only
 * exists while you are looking at /timer, which is the one screen you should
 * not be looking at during a focus session. It hides on /timer itself, where
 * the full timer is already the page.
 *
 * Idle and finished states show nothing. There is no "you have not started a
 * session today" nudge — that is the guilt mechanic GOALS.md rules out.
 */
export function FocusPill() {
  const timer = useFocusTimer()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const visible =
    (timer.status === 'running' || timer.status === 'paused') &&
    pathname !== '/timer'

  if (!visible) return null

  return (
    <div className="fixed right-4 bottom-20 z-40 md:right-6 md:bottom-6">
      <div className="flex items-center gap-3 rounded-xl bg-focus py-2.5 pr-2.5 pl-4 text-focus-fg shadow-float">
        <button
          onClick={() => navigate('/timer')}
          className="flex items-center gap-3 text-left"
        >
          <Clock className="size-4 text-focus-muted-fg" />
          <span className="flex flex-col leading-tight">
            <span className="font-mono text-base font-semibold tabular-nums">
              {clock(timer.remainingMs)}
            </span>
            <span className="text-[10px] tracking-wide text-focus-muted-fg uppercase">
              {timer.status === 'paused' ? 'Dijeda' : 'Sesi fokus'}
            </span>
          </span>
        </button>

        <button
          onClick={timer.status === 'running' ? timer.pause : timer.resume}
          aria-label={timer.status === 'running' ? 'Jeda' : 'Lanjut'}
          className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-fg transition-colors hover:bg-primary/90"
        >
          {timer.status === 'running' ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </button>
      </div>
    </div>
  )
}
