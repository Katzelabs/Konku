import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { today } from '../../lib/date'
import { useLogSession } from './queries'
import { useTimer } from './useTimer'

/**
 * One timer for the whole app.
 *
 * `useTimer` used to be called from TimerPage, which meant navigating away
 * unmounted it — the session survived only because it is persisted to
 * localStorage, and nothing outside /timer knew it was running. Lifting it here
 * makes the focus pill possible, and more importantly means the capture prompt
 * fires wherever you happen to be when the session ends. That prompt is the
 * whole reason the timer is in the MVP (D-036); it must not depend on which tab
 * you were looking at.
 *
 * Still genuine client state, still out of TanStack Query (D-044). A context
 * rather than Zustand because there is exactly one consumer tree and no
 * selector-shaped performance problem to solve.
 */

type Timer = ReturnType<typeof useTimer>

interface TimerApi extends Timer {
  /** The finished session failed to record. The user can retry. */
  logFailed: boolean
  retryLog: () => void
}

const TimerContext = createContext<TimerApi | null>(null)

export function TimerProvider({ children }: { children: ReactNode }) {
  const timer = useTimer()
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

  const value: TimerApi = {
    ...timer,
    logFailed: logSession.isError,
    retryLog: () =>
      logSession.mutate({ domainId, durationMinutes, sessionDate: today() }),
  }

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
}

export function useFocusTimer() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useFocusTimer must be used inside <TimerProvider>')
  return ctx
}
