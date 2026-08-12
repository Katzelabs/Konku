import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'

/**
 * Peeking is a URL, not component state.
 *
 * Opening a preview navigates to the item's own path — `/notes/:id` — so the
 * address bar names what you are looking at. That buys three things that local
 * state cannot: Back closes the peek, the link is copyable, and reloading it
 * lands somewhere sensible.
 *
 * The trick is the background location. Navigating carries the list's location
 * in history state, and App renders the main `<Routes>` against *that* while
 * rendering the peek against the real one. The list therefore stays mounted
 * and keeps its own filters and scroll, even though the URL has moved on.
 *
 * The consequence worth stating: a URL pasted into a fresh tab has no history
 * state, so `/notes/:id` opens the full-page editor. That is the correct
 * answer — a peek only means anything over a list you were already looking at.
 */
interface PeekBackground {
  pathname: string
  search: string
}

interface PeekState {
  /** The real pathname while a peek is open, else null. */
  peekedPath: string | null
  /**
   * The list's location, while a peek is open.
   *
   * It is in context rather than read from `useLocation` because the list is
   * rendered inside `<Routes location={background}>`, and React Router hands
   * that override to everything below it. A component in the list therefore
   * sees the list's own location — which is the entire point, and also why it
   * cannot find the peek, or the background, by itself.
   */
  background: PeekBackground | null
}

const PeekContext = createContext<PeekState>({ peekedPath: null, background: null })

/** Reads the background location out of history state, if there is one. */
export function usePeekBackground(): PeekBackground | null {
  const location = useLocation()
  const state = location.state as { peekBackground?: PeekBackground } | null
  return state?.peekBackground ?? null
}

export function PeekProvider({
  peekedPath,
  background,
  children,
}: {
  peekedPath: string | null
  background: PeekBackground | null
  children: ReactNode
}) {
  const value = useMemo(() => ({ peekedPath, background }), [peekedPath, background])
  return <PeekContext.Provider value={value}>{children}</PeekContext.Provider>
}

/**
 * The id currently being peeked under `prefix`, for the list to mark its
 * active row.
 *
 * The list reads this from context rather than from `useLocation`, because
 * inside the background `<Routes>` its own location is the list's — which is
 * the whole point, and also why it cannot see the peek by itself.
 */
export function usePeekedId(prefix: string): string | null {
  const { peekedPath } = useContext(PeekContext)
  if (!peekedPath || !peekedPath.startsWith(prefix)) return null

  const rest = peekedPath.slice(prefix.length)
  // Only a direct child: `/notes/abc` peeks, `/notes/abc/anything` does not.
  return rest && !rest.includes('/') ? rest : null
}

export function usePeekNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const { peekedPath, background } = useContext(PeekContext)

  return useMemo(
    () => ({
      /**
       * Open `to` as a peek over the current list.
       *
       * Replaces rather than pushes when a peek is already open, so clicking
       * through six rows leaves one history entry and Back returns to the
       * list rather than walking the six.
       */
      open(to: string) {
        navigate(to, {
          replace: peekedPath !== null,
          state: {
            peekBackground: { pathname: location.pathname, search: location.search },
          },
        })
      },

      /** Promote the open peek to its own page: same path, no background. */
      openFull(to: string) {
        navigate(to, { replace: true })
      },

      /**
       * Close the open peek.
       *
       * The background comes from context rather than an argument, because the
       * caller is now the list itself and the list cannot see it — see the
       * note on PeekState.background.
       */
      close() {
        // Back, so the browser restores the list's scroll position. There is
        // always somewhere to go back to: a peek cannot exist without the
        // navigation that opened it.
        if (background) navigate(-1)
        else navigate('/home')
      },
    }),
    [navigate, location.pathname, location.search, peekedPath, background],
  )
}

/** Narrow a router Location to the serialisable part history state can hold. */
export function toBackground(location: Location): PeekBackground {
  return { pathname: location.pathname, search: location.search }
}
