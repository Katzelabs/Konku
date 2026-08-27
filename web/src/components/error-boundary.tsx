import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from './ui/button'
import { Notice } from './ui/notice'
import { bootLocale, copyFor } from '../i18n'
import { reportClientError } from '../lib/report-error'

/**
 * Error boundaries (F-03).
 *
 * A throw during render used to unmount the entire tree, leaving a white page
 * with no way back except a reload the person had to think of themselves. That
 * is the failure this product exists to prevent wearing different clothes: what
 * they wrote is still on the server, and the screen says nothing at all.
 *
 * A class component because there is no hook equivalent —
 * `getDerivedStateFromError` and `componentDidCatch` are the only way React
 * offers to catch a render error, and that has not changed in 19. React
 * Router's `errorElement` is not an option either: it belongs to the data
 * router, and this app is on the declarative `<BrowserRouter><Routes>` (D-032's
 * shape, main.tsx).
 */

interface Props {
  children: ReactNode
  /** Rendered in place of the children once one of them has thrown. */
  fallback: ReactNode
  /**
   * When this changes after a crash, the boundary clears itself and tries the
   * children again.
   *
   * Deliberately a prop compared in `componentDidUpdate` rather than a `key` on
   * the boundary. A changing `key` unmounts and remounts the whole subtree on
   * every change — and the route boundary's key is the pathname, which changes
   * every time a peek opens over a list (D-084). That would throw away the list
   * underneath the preview on every click.
   */
  resetKey?: string
}

interface State {
  crashed: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The one place a render crash becomes telemetry. Reporting from here
    // rather than from createRoot's onCaughtError keeps it in the component
    // that owns the failure, and testable without a root.
    reportClientError(error, 'render', info.componentStack ?? undefined)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.crashed && prev.resetKey !== this.props.resetKey) {
      this.setState({ crashed: false })
    }
  }

  render() {
    return this.state.crashed ? this.props.fallback : this.props.children
  }
}

/**
 * What a crash looks like.
 *
 * Neutral, like every other message in this app: a component that failed to
 * render is not the reader's doing and the copy does not imply it is (hard rule
 * 6). It states what happened, that it has already been reported, and the one
 * action worth offering.
 *
 * It promises nothing about unsaved text, because it cannot keep that promise —
 * the note editor autosaves and the card editor does not.
 */
function CrashScreen({ full = false }: { full?: boolean }) {
  /*
   * `copyFor(bootLocale())`, not `useCopy()`.
   *
   * The outer boundary sits above `LocaleProvider` in `main.tsx` — deliberately,
   * so a throw inside a provider is still caught — and a hook reading the
   * context from outside it would answer with the default locale, which is to
   * say Indonesian, for every English reader who ever sees this screen. The
   * boot locale is the same answer `main.tsx` resolved synchronously before
   * anything mounted, and `copyFor` falls back to Indonesian on its own if the
   * English chunk never arrived — which is the documented fallback, and exactly
   * the situation a crash screen has to survive (hard rule 8, D-085).
   */
  const c = copyFor(bootLocale()).common.error

  return (
    <div
      role="alert"
      className={
        full
          ? 'mx-auto flex min-h-dvh max-w-sm flex-col items-start justify-center gap-4 p-6'
          : 'flex flex-col items-start gap-4 py-12'
      }
    >
      <Notice>{c.crash}</Notice>
      <Button variant="primary" onClick={() => window.location.reload()}>
        {c.reload}
      </Button>
    </div>
  )
}

/**
 * The outermost boundary, around everything including the router.
 *
 * This is the one that catches a throw in a provider, in the shell, or on the
 * signed-out screens. Its fallback is the whole page, because at this level
 * there is no page left around it.
 */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary fallback={<CrashScreen full />}>{children}</ErrorBoundary>
}

/**
 * The per-route boundary, inside the shell and around the routes.
 *
 * Containment is the point: one broken screen leaves the sidebar, the nav and
 * the timer alive, so the way out is a click rather than a reload, and clicking
 * it clears the crash — that is what `resetKey` is for.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <ErrorBoundary fallback={<CrashScreen />} resetKey={location.pathname}>
      {children}
    </ErrorBoundary>
  )
}
