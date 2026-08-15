import { useEffect, useRef } from 'react'

/**
 * A write to send if the tab is about to go away.
 *
 * `path` is relative to `/api`, the same as everything in api/client.ts. The
 * request is built here rather than going through `api` because the transport
 * is the point: `keepalive` is what lets a request outlive the document, and
 * it carries constraints (see KEEPALIVE_LIMIT) the ordinary client should not
 * have to know about.
 */
export interface PendingWrite {
  path: string
  method: 'POST' | 'PATCH' | 'PUT'
  body: unknown
}

export interface FlushOnHide {
  /**
   * The page went to the background but is still running. This is the primary
   * path and it should be the editor's ordinary save: React Query is alive, so
   * the response can be adopted, the status line updates, and a mutation that
   * is already pending will not be started twice.
   *
   * It is also the only path a mobile browser reliably gives you. A tab that
   * is backgrounded and later killed to reclaim memory never fires `pagehide`
   * at all, so a request that has not already left by the time the page hides
   * never leaves.
   */
  onHidden?: () => void
  /**
   * The last chance, sent on `pagehide` with `keepalive` so it survives the
   * document being torn down. It MUST be idempotent — nothing here can read
   * the response, so a write that creates a row does not belong on this path.
   */
  pending?: () => PendingWrite | null
}

/**
 * The Fetch spec gives keepalive requests a 64 KiB budget per origin, shared
 * across every inflight one, and a body over it makes fetch reject rather than
 * truncate. A note can be longer than that, so the oversized case falls back
 * to an ordinary request: it will not survive a real close, but that case is
 * unreachable either way, and it still lands on the far more common
 * "hidden, still alive" path.
 */
const KEEPALIVE_LIMIT = 60 * 1024

/**
 * Saves what is in an editor when the tab is hidden or closed.
 *
 * `beforeunload` is deliberately not one of the events. It is unreliable on
 * mobile, it is ignored outright once a page has never been interacted with,
 * and it is the one that can raise a "you have unsaved changes" dialog — which
 * is a guilt prompt for something the app can simply handle (hard rule 6).
 * `visibilitychange` and `pagehide` fire where it does not, and neither can
 * interrupt anyone.
 */
export function useFlushOnHide({ onHidden, pending }: FlushOnHide) {
  const latest = useRef({ onHidden, pending })
  latest.current = { onHidden, pending }

  useEffect(() => {
    // What the keepalive path already sent during this trip to the background.
    // A browser closing a tab fires visibilitychange and then pagehide, and a
    // caller that supplies no `onHidden` would otherwise send the same body
    // twice for one departure.
    let sent: string | null = null

    const flush = () => {
      const write = latest.current.pending?.()
      if (!write) return
      const body = JSON.stringify(write.body)
      const payload = `${write.method} ${write.path} ${body}`
      if (payload === sent) return
      sent = payload
      send(write, body)
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') {
        // Back on screen, and possibly edited again before the next departure.
        sent = null
        return
      }
      // The ordinary path when there is one; the keepalive path is then held
      // back for pagehide, where it is a backstop rather than a duplicate.
      if (latest.current.onHidden) latest.current.onHidden()
      else flush()
    }

    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}

function send(write: PendingWrite, body: string) {
  fetch(`/api${write.path}`, {
    method: write.method,
    // Same-origin, so the session cookie rides along and the Origin header
    // enforceOrigin checks is the app's own.
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'konku',
    },
    body,
    keepalive: new TextEncoder().encode(body).length <= KEEPALIVE_LIMIT,
  }).catch(() => {
    // The document is leaving. There is no screen left to report this to, and
    // an unhandled rejection during unload is noise in the console of whatever
    // page loads next.
  })
}
