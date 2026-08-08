import { useCallback, useEffect, useState } from 'react'
import type { DomainId } from '../../api/types'

/**
 * Short durations first, and 20 is the default rather than 25.
 *
 * Deliberate: the person this is built for is training focus up from a low
 * baseline, and a picker that opens on the longest option quietly says the
 * short ones do not count (GOALS.md).
 */
export const DURATIONS = [15, 20, 25, 30, 45] as const
export const DEFAULT_DURATION = 20

const STORAGE_KEY = 'konku.timer'
const TICK_MS = 250

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

interface TimerState {
  status: TimerStatus
  durationMinutes: number
  domainId: DomainId | null
  /** Wall-clock instant the session ends, while running. */
  targetAt: number | null
  /** What was left when paused. */
  remainingMs: number | null
  /** Whether the finished session has already been recorded (A3). */
  logged: boolean
}

const initial: TimerState = {
  status: 'idle',
  durationMinutes: DEFAULT_DURATION,
  domainId: null,
  targetAt: null,
  remainingMs: null,
  logged: false,
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Restores a timer across a refresh.
 *
 * A session that ended while the tab was closed comes back finished, not
 * reset — the twenty minutes really did pass, and the capture prompt is the
 * whole reason the timer exists (D-038).
 */
function load(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initial

    const parsed = { ...initial, ...(JSON.parse(raw) as Partial<TimerState>) }
    if (!DURATIONS.includes(parsed.durationMinutes as (typeof DURATIONS)[number])) {
      parsed.durationMinutes = DEFAULT_DURATION
    }
    // Domains used to be slugs like "math" and are now per-user uuids (D-046).
    // A timer left running across the change would post a stale slug and get a
    // 400 at the one moment that must not fail — the capture prompt. Drop it;
    // an untagged session is a normal thing.
    if (parsed.domainId !== null && !UUID.test(parsed.domainId)) {
      parsed.domainId = null
    }
    if (parsed.status === 'running' && (!parsed.targetAt || Date.now() >= parsed.targetAt)) {
      return { ...parsed, status: 'done', targetAt: null, remainingMs: null }
    }
    return parsed
  } catch {
    // A corrupt or unavailable store is not worth an error screen.
    return initial
  }
}

/**
 * The focus timer.
 *
 * Driven from a wall-clock target rather than a counter that decrements on
 * each tick. Background tabs throttle setInterval to roughly once a second or
 * worse, so a counted-down timer drifts by minutes over a long session — it
 * would finish late, and the one number the user is trusting would be wrong.
 * Here the interval only decides when to *look* at the clock.
 *
 * This is genuine client state and stays out of TanStack Query (D-044).
 */
export function useTimer() {
  const [state, setState] = useState<TimerState>(load)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Private mode or a full quota: the timer still works for this tab.
    }
  }, [state])

  useEffect(() => {
    if (state.status !== 'running' || state.targetAt === null) return
    const target = state.targetAt

    const tick = () => {
      if (Date.now() >= target) {
        setState((s) => (s.status === 'running' ? { ...s, status: 'done', targetAt: null } : s))
        return
      }
      setNow(Date.now())
    }

    tick()
    const id = setInterval(tick, TICK_MS)
    // Coming back to a throttled tab should settle immediately rather than
    // waiting out the interval.
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [state.status, state.targetAt])

  const remainingMs =
    state.status === 'running' && state.targetAt !== null
      ? Math.max(0, state.targetAt - now)
      : state.status === 'paused'
        ? (state.remainingMs ?? 0)
        : state.status === 'done'
          ? 0
          : state.durationMinutes * 60_000

  const setDuration = useCallback((minutes: number) => {
    setState((s) => (s.status === 'idle' ? { ...s, durationMinutes: minutes } : s))
  }, [])

  const setDomain = useCallback((domainId: DomainId | null) => {
    setState((s) => ({ ...s, domainId }))
  }, [])

  const start = useCallback(() => {
    setState((s) => ({
      ...s,
      status: 'running',
      targetAt: Date.now() + s.durationMinutes * 60_000,
      remainingMs: null,
      logged: false,
    }))
  }, [])

  const pause = useCallback(() => {
    setState((s) =>
      s.status === 'running' && s.targetAt !== null
        ? { ...s, status: 'paused', remainingMs: Math.max(0, s.targetAt - Date.now()), targetAt: null }
        : s,
    )
  }, [])

  const resume = useCallback(() => {
    setState((s) =>
      s.status === 'paused'
        ? { ...s, status: 'running', targetAt: Date.now() + (s.remainingMs ?? 0), remainingMs: null }
        : s,
    )
  }, [])

  /** Back to the start, keeping the chosen duration and domain. */
  const reset = useCallback(() => {
    setState((s) => ({ ...s, status: 'idle', targetAt: null, remainingMs: null, logged: false }))
  }, [])

  /**
   * Records that the finished session has been sent to the server, so a
   * refresh while the capture prompt is open cannot log it twice.
   */
  const markLogged = useCallback(() => {
    setState((s) => ({ ...s, logged: true }))
  }, [])

  return {
    status: state.status,
    durationMinutes: state.durationMinutes,
    domainId: state.domainId,
    logged: state.logged,
    remainingMs,
    setDuration,
    setDomain,
    start,
    pause,
    resume,
    reset,
    markLogged,
  }
}
