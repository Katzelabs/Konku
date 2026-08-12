import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
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
      open(to: string, options?: { replace?: boolean }) {
        navigate(to, {
          replace: options?.replace ?? peekedPath !== null,
          state: {
            peekBackground: { pathname: location.pathname, search: location.search },
          },
        })
      },

      /**
       * Open `to` without leaving a history entry behind.
       *
       * For the selection the list makes on its own behalf: list view opens
       * its top row on arrival, and pushing that would mean Back walks through
       * a choice the user never made — press it once and you land on the same
       * screen with nothing selected, which is not a state the screen has.
       */
      select(to: string) {
        navigate(to, {
          replace: true,
          state: {
            peekBackground: { pathname: location.pathname, search: location.search },
          },
        })
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

/**
 * Keep the top of the list open, in a layout that has room for it.
 *
 * An index in list view is a two-column screen, and the second column is only
 * worth its width if something is in it. Arriving to "pilih catatan untuk
 * membacanya di sini" means the first thing the screen asks you to do is a
 * click it could have made for you — so it makes it.
 *
 * Three conditions, and each one is load-bearing:
 *
 * - `enabled` is off in grid view (the preview is a modal there, and opening a
 *   modal at someone on arrival is hostile), off in the Terhapus view, and off
 *   below `lg` where there is only one column.
 * - It re-selects when the open item leaves the list — filtered out, deleted,
 *   or searched past — because a preview of something no longer in the list
 *   beside it is a dead end. That is why it compares against `ids` rather than
 *   only firing once.
 * - It replaces rather than pushes, so Back never walks through a selection
 *   the user did not make.
 */
export function useAutoSelect({
  enabled,
  ids,
  peekedId,
  toPath,
}: {
  enabled: boolean
  /** The ids currently in the list, in the order they are shown. */
  ids: string[]
  /** What is open right now, if anything. */
  peekedId: string | null
  toPath: (id: string) => string
}) {
  const peek = usePeekNavigation()

  // `ids` is a fresh array every render, so the effect keys on its contents.
  // Depending on the array itself would re-run this on every keystroke in the
  // search box and fight the navigation it just performed.
  const key = ids.join(',')

  useEffect(() => {
    if (!enabled) return

    const list = key ? key.split(',') : []
    if (list.length === 0) return
    if (peekedId && list.includes(peekedId)) return

    peek.select(toPath(list[0]))
    // peek and toPath are rebuilt every render; including them would make this
    // an infinite loop. What it actually depends on is what is in the list and
    // what is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, peekedId])
}

/** Narrow a router Location to the serialisable part history state can hold. */
export function toBackground(location: Location): PeekBackground {
  return { pathname: location.pathname, search: location.search }
}
