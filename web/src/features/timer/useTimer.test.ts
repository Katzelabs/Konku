import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DURATION, useTimer } from './useTimer'

// The timer is the one piece of genuine client state (D-044), and it is driven
// from a wall-clock target rather than a decrementing counter — because a
// background tab throttles setInterval and a counted-down timer drifts by
// minutes. These tests use fake timers so that property is actually exercised
// rather than waited out.

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('state transitions', () => {
  it('starts idle at the default duration', () => {
    const { result } = renderHook(() => useTimer())

    expect(result.current.status).toBe('idle')
    expect(result.current.durationMinutes).toBe(DEFAULT_DURATION)
    expect(result.current.remainingMs).toBe(DEFAULT_DURATION * 60_000)
  })

  it('runs, pauses keeping what was left, and resumes from there', () => {
    const { result } = renderHook(() => useTimer())

    act(() => result.current.start())
    expect(result.current.status).toBe('running')

    act(() => {
      vi.advanceTimersByTime(5 * 60_000)
    })
    expect(result.current.remainingMs).toBeLessThanOrEqual(15 * 60_000)

    act(() => result.current.pause())
    expect(result.current.status).toBe('paused')
    const heldAtPause = result.current.remainingMs

    // Time passing while paused must not consume the session.
    act(() => {
      vi.advanceTimersByTime(10 * 60_000)
    })
    expect(result.current.remainingMs).toBe(heldAtPause)

    act(() => result.current.resume())
    expect(result.current.status).toBe('running')
    expect(result.current.remainingMs).toBeLessThanOrEqual(heldAtPause)
  })

  it('finishes on its own when the target passes', () => {
    const { result } = renderHook(() => useTimer())

    act(() => result.current.start())
    act(() => {
      vi.advanceTimersByTime(DEFAULT_DURATION * 60_000 + 1000)
    })

    expect(result.current.status).toBe('done')
    expect(result.current.remainingMs).toBe(0)
  })

  // The wall-clock design, asserted. A counter that decrements per tick would
  // still be running here, because a throttled tab delivers far fewer ticks
  // than elapsed milliseconds.
  it('finishes on elapsed wall-clock time, not on tick count', () => {
    const { result } = renderHook(() => useTimer())

    act(() => result.current.start())

    // Jump the clock forward without delivering the intervening ticks, the
    // way a throttled background tab does.
    act(() => {
      vi.setSystemTime(Date.now() + DEFAULT_DURATION * 60_000 + 5_000)
      vi.advanceTimersByTime(250)
    })

    expect(result.current.status).toBe('done')
  })

  it('only changes duration while idle, so a running session cannot be edited', () => {
    const { result } = renderHook(() => useTimer())

    act(() => result.current.setDuration(45))
    expect(result.current.durationMinutes).toBe(45)

    act(() => result.current.start())
    act(() => result.current.setDuration(15))
    expect(result.current.durationMinutes).toBe(45)
  })

  it('reset returns to idle but keeps the chosen duration and domain', () => {
    const { result } = renderHook(() => useTimer())
    const domain = '11111111-1111-1111-1111-111111111111'

    act(() => result.current.setDuration(30))
    act(() => result.current.setDomain(domain))
    act(() => result.current.start())
    act(() => result.current.reset())

    expect(result.current.status).toBe('idle')
    expect(result.current.durationMinutes).toBe(30)
    expect(result.current.domainId).toBe(domain)
    expect(result.current.logged).toBe(false)
  })

  // Guards double-logging a session when the capture prompt is open and the
  // tab is refreshed (A3).
  it('remembers that a finished session was already recorded', () => {
    const { result } = renderHook(() => useTimer())

    act(() => result.current.start())
    act(() => {
      vi.advanceTimersByTime(DEFAULT_DURATION * 60_000 + 1000)
    })
    act(() => result.current.markLogged())

    expect(result.current.logged).toBe(true)
  })
})

describe('restoring across a refresh', () => {
  // D-038: the twenty minutes really did pass, so the session comes back
  // finished rather than reset. The capture prompt is the reason the timer
  // exists, and silently discarding a completed session throws it away.
  it('a session that ended while the tab was closed comes back done', () => {
    localStorage.setItem(
      'konku.timer',
      JSON.stringify({
        status: 'running',
        durationMinutes: 20,
        domainId: null,
        targetAt: Date.now() - 60_000, // ended a minute ago
        remainingMs: null,
        logged: false,
      }),
    )

    const { result } = renderHook(() => useTimer())

    expect(result.current.status).toBe('done')
    expect(result.current.remainingMs).toBe(0)
  })

  it('a still-running session comes back running', () => {
    localStorage.setItem(
      'konku.timer',
      JSON.stringify({
        status: 'running',
        durationMinutes: 20,
        domainId: null,
        targetAt: Date.now() + 5 * 60_000,
        remainingMs: null,
        logged: false,
      }),
    )

    const { result } = renderHook(() => useTimer())

    expect(result.current.status).toBe('running')
    expect(result.current.remainingMs).toBeGreaterThan(0)
  })

  // Domains became per-user uuids (D-046). A timer left running across that
  // change would post a stale slug and get a 400 at the one moment that must
  // not fail — the capture prompt.
  it('drops a legacy slug domain rather than posting it', () => {
    localStorage.setItem(
      'konku.timer',
      JSON.stringify({ status: 'idle', durationMinutes: 20, domainId: 'math', logged: false }),
    )

    const { result } = renderHook(() => useTimer())
    expect(result.current.domainId).toBeNull()
  })

  it('keeps a uuid domain', () => {
    const domain = '22222222-2222-2222-2222-222222222222'
    localStorage.setItem(
      'konku.timer',
      JSON.stringify({ status: 'idle', durationMinutes: 20, domainId: domain, logged: false }),
    )

    const { result } = renderHook(() => useTimer())
    expect(result.current.domainId).toBe(domain)
  })

  it('falls back to the default for an unknown duration', () => {
    localStorage.setItem(
      'konku.timer',
      JSON.stringify({ status: 'idle', durationMinutes: 7, domainId: null, logged: false }),
    )

    const { result } = renderHook(() => useTimer())
    expect(result.current.durationMinutes).toBe(DEFAULT_DURATION)
  })

  it('survives a corrupt store rather than showing an error screen', () => {
    localStorage.setItem('konku.timer', 'not json at all')

    const { result } = renderHook(() => useTimer())
    expect(result.current.status).toBe('idle')
    expect(result.current.durationMinutes).toBe(DEFAULT_DURATION)
  })
})
