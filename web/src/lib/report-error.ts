/**
 * Client crash reporting (F-03).
 *
 * Sentry runs server-side and stays there — `connect-src 'self'` has no
 * exception for an ingest host, and widening the CSP is the one thing this
 * feature must not cost (internal/api/security.go). So a crash is posted to the
 * origin that served the page, and the Go process is what forwards it
 * (internal/api/clienterror.go). No policy changes, no third-party script, no
 * lockfile entry.
 *
 * Three rules this module has to keep, because it runs at the worst possible
 * moment:
 *
 * 1. **It never throws.** Everything here is wrapped or guarded. A reporter
 *    that fails while reporting turns one crash into two, and the second one is
 *    the one nobody can see.
 * 2. **It is bounded.** Five reports per page load, one per distinct error, and
 *    every field truncated before it is sent. The server caps the same things
 *    again — the browser's half of a limit is one bug away from not running.
 * 3. **It sends the shape of the failure, never the content of the page.** The
 *    path without its query string, an error message, a stack. Hard rule 10 is
 *    about logs; the reasoning is the same for anything that leaves the box.
 */

/** Same origin, so the request needs no CSP exception and carries no CORS. */
const endpoint = '/api/client-error'

/**
 * Mirrors the caps in internal/api/clienterror.go.
 *
 * Duplicated rather than negotiated: the server does not trust these, it
 * enforces its own. Cutting here is what keeps a stack from being trimmed
 * mid-frame by a byte limit that knows nothing about frames.
 */
const maxMessage = 300
const maxStack = 4_000

/**
 * The cap for one page load.
 *
 * A crash loop — a component that throws, gets caught, and throws again on the
 * fallback's next render — is the case this exists for. Five reports say
 * everything six thousand would, and the sixth is the one that would have
 * turned a bug into an outbound flood.
 */
const maxReports = 5

let reports = 0
const seen = new Set<string>()

export type ClientErrorKind = 'render' | 'global' | 'rejection'

interface Report {
  message: string
  stack: string
  route: string
  kind: ClientErrorKind
}

/**
 * Pulls a message and a stack out of whatever was thrown.
 *
 * `throw` accepts any value, and a rejected promise rejects with any value, so
 * this cannot assume an Error. A non-Error becomes `String(value)` rather than
 * JSON on purpose: the message is a label for the event, and serialising an
 * arbitrary object is the one shape here that could carry somebody's data out
 * of the page.
 */
function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack ?? '' }
  }
  if (typeof error === 'string') return { message: error, stack: '' }
  return { message: String(error), stack: '' }
}

/**
 * Reports one error, at most once.
 *
 * Deduplication keys on the error and deliberately not on the kind. React
 * re-throws an error an error boundary already handled so that `window.onerror`
 * still sees it, which means a single render crash arrives here twice under two
 * different kinds — and two events for one bug make "how many things are broken"
 * unanswerable. Whichever lands first wins.
 */
export function reportClientError(
  error: unknown,
  kind: ClientErrorKind,
  componentStack?: string,
): void {
  try {
    const { message, stack } = describe(error)
    if (!message) return

    const signature = `${message}\n${stack.slice(0, 200)}`
    if (seen.has(signature)) return
    seen.add(signature)

    if (reports >= maxReports) return
    reports += 1

    // React's component stack names the components between the boundary and
    // the throw, which is the part a minified JS stack cannot tell you. It is
    // component names, so it carries nothing a user wrote.
    const full = componentStack ? `${stack}\n\nComponent stack:${componentStack}` : stack

    send({
      message: message.slice(0, maxMessage),
      stack: full.slice(0, maxStack),
      // pathname only. `location.href` would carry the query string, and on the
      // index screens that is the search box's contents.
      route: window.location.pathname,
      kind,
    })
  } catch {
    // Rule 1. Whatever went wrong in here, the page has already crashed once
    // and this must not be the second thing it does.
  }
}

/**
 * Posts the report.
 *
 * Deliberately not `api.post` from api/client.ts. That helper throws an
 * ApiError on any non-2xx, and an ApiError thrown from here would surface as an
 * unhandled rejection — which is one of the two things this module listens for.
 * The cap above bounds that loop; not building it is better.
 *
 * `Content-Type: application/json` is required rather than decorative:
 * enforceOrigin refuses a write with any other content type, because the three
 * an HTML form can produce are the shape of a form-based CSRF (D-060).
 */
function send(report: Report): void {
  try {
    void fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      // Lets the request outlive the page. A crash during navigation or on the
      // way to a reload is still a crash worth hearing about.
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'konku',
      },
      body: JSON.stringify(report),
    }).catch(() => {
      // A failed report is not worth a second failure. There is nowhere left
      // to escalate to: the server is the only sink the browser has.
    })
  } catch {
    // fetch itself can throw synchronously on a malformed request.
  }
}

/**
 * Listens for the errors an error boundary cannot see.
 *
 * A boundary catches throws during render, in lifecycle methods and in
 * constructors — and nothing else. An event handler that throws, a `setTimeout`
 * callback, a rejected promise nobody awaited: all of those leave the page
 * looking fine and the console the only witness. These two listeners are the
 * other half of the coverage.
 *
 * Called once, from main.tsx, before the first render.
 */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    // 'error' also fires when a resource fails to load — an <img>, a stylesheet,
    // a lazy chunk — with the element as the target and no `error` on the
    // event. A 404 on an icon is not a crash, and reporting it would spend the
    // budget above on noise.
    //
    // Discriminated on the target being an element rather than on it *not*
    // being `window`: jsdom hands the listener a Window that is not identical
    // to the `window` global, so the negative test drops every real error under
    // test while passing in a browser.
    if (event.target instanceof Element) return
    reportClientError(event.error ?? event.message, 'global')
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, 'rejection')
  })
}

/**
 * Clears the per-load counters.
 *
 * A test seam, and the only one: `reports` and `seen` are scoped to a page load
 * in the browser, and a test file is a single load with many of them in it.
 */
export function resetClientErrorReporting(): void {
  reports = 0
  seen.clear()
}
