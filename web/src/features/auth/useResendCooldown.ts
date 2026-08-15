import { useCallback, useEffect, useState } from 'react'
import { shortHash } from '../../lib/storage'

/** How long to wait between verification mails. */
export const RESEND_COOLDOWN_SECONDS = 60

const STORAGE_PREFIX = 'konku:resend-until:'

/**
 * A countdown between "kirim ulang" presses.
 *
 * The point is not to stop an attacker — the server already does that, by IP
 * and by target address, and a client-side timer is deleted by anyone who
 * opens devtools. The point is the ordinary case: the mail takes a few seconds
 * to arrive, the button is right there, and pressing it four times sends four
 * messages to a mailbox that is about to receive one. The person doing that is
 * the account holder, they are not attacking anything, and the thing they are
 * spamming is their own inbox.
 *
 * **The deadline is stored, not the remaining seconds.** A counter held in
 * state is a counter that resets on reload, which turns the limit into a
 * suggestion — and reloading is exactly what this screen tells people to do
 * after clicking the link in the mail. Persisting an absolute time means the
 * cooldown is the same sixty seconds whether the tab stayed open or not.
 *
 * Keyed by address so signing out and signing in as someone else does not
 * inherit the previous account's wait — but by a *hash* of it, never the
 * address itself. The key used to be `konku:resend-until:you@example.com`,
 * which wrote an email address into persistent storage on a possibly shared
 * device, where it outlived the session and even account deletion (F-10).
 * Hard rule 10 keeps addresses out of logs; this is the same class of thing.
 * The hash only has to be stable and unreadable at a glance — see shortHash.
 */
export function useResendCooldown(
  key: string,
  seconds: number = RESEND_COOLDOWN_SECONDS,
) {
  const storageKey = STORAGE_PREFIX + shortHash(key)

  const [until, setUntil] = useState<number>(() => readDeadline(storageKey, seconds))
  const [now, setNow] = useState(() => Date.now())

  // A whole second of slack, so the label never shows "0 detik" for a frame
  // before the button comes back.
  const remaining = Math.max(0, Math.ceil((until - now) / 1000))
  const waiting = remaining > 0

  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [waiting])

  // A different address is a different cooldown, and the state has to follow
  // the key or the previous account's countdown is shown against the new one.
  useEffect(() => {
    setUntil(readDeadline(storageKey, seconds))
    setNow(Date.now())
  }, [storageKey, seconds])

  const start = useCallback(() => {
    const deadline = Date.now() + seconds * 1000
    setUntil(deadline)
    setNow(Date.now())
    try {
      localStorage.setItem(storageKey, String(deadline))
    } catch {
      // Private mode, a full quota, or storage disabled outright. The
      // countdown still works for this tab; it simply will not survive a
      // reload. Refusing to run the timer at all would be the worse failure.
    }
  }, [seconds, storageKey])

  return { remaining, waiting, start }
}

function readDeadline(storageKey: string, seconds: number): number {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return 0

    const value = Number(raw)
    if (!Number.isFinite(value)) return 0

    // Clamped, and this is the branch that matters. A deadline further out
    // than the cooldown itself cannot have been written by `start` — it means
    // the clock moved backwards since, or the value was edited by hand. Left
    // unclamped it locks the button for however long the skew was, and the
    // button it locks is the only one that unsticks a signup nobody can get
    // past. Failing toward "you may resend" is the correct direction here:
    // the server is what actually enforces the limit.
    return Math.min(value, Date.now() + seconds * 1000)
  } catch {
    return 0
  }
}
