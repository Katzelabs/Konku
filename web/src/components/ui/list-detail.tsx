import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * The index layout: a list beside the thing it is a list of.
 *
 * The preview used to be a `fixed inset-y-0 right-0` panel that sat *over* the
 * page and pushed the content out of its way with a padding class in App. That
 * worked, and it cost three things worth having: the panel was the same width
 * on a 13" laptop and a 27" monitor, the page header slid underneath it, and
 * the list and the preview could not be told to share a height because they
 * were in different stacking worlds.
 *
 * Here they are two columns of one grid, under a full-width header. The list
 * keeps a fixed measure and the preview takes the rest, which is the ratio the
 * design asks for and which stays sensible as the window grows.
 *
 * Below `lg` there is only room for one, so it swaps: the list until something
 * is open, then the preview. Back closes the peek and the list returns —
 * peeking is a URL, so that is the browser's own button doing it (peek-route).
 */
export function ListDetail({
  /** False when the preference is 'full' or 'center': the list gets everything. */
  split,
  /** Something is open, which is what the narrow-screen swap keys on. */
  peeked,
  /** The open item's preview, or null when nothing is open. */
  detail,
  /** What the second column says with nothing open. Only used when split. */
  placeholder,
  children,
}: {
  split: boolean
  peeked: boolean
  detail: ReactNode
  placeholder?: ReactNode
  children: ReactNode
}) {
  // Not split, but `detail` still renders: in `center` mode it is a Radix
  // dialog, which portals to the body and does not care where it was mounted.
  // Dropping it here would silently turn that preference into "opens nothing".
  if (!split) {
    return (
      <>
        {children}
        {detail}
      </>
    )
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      {/*
        A container, so the list inside can lay itself out against this column
        rather than the viewport. Without it a grid view would ask for three
        columns at the `lg` *screen* breakpoint and get three columns inside a
        24rem pane.
      */}
      <div className={cn('@container min-w-0', peeked && 'hidden lg:block')}>
        {children}
      </div>

      {/*
        Sticky, and scrolling inside itself: reading a long note should not
        drag the list you were scanning off the top of the screen. `top-0` is
        enough because AppShell's main column is the scroll container, not the
        window.
      */}
      <div
        className={cn(
          'min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto',
          !peeked && 'hidden lg:block',
        )}
      >
        {detail ?? placeholder}
      </div>
    </div>
  )
}

/**
 * What the preview column shows with nothing selected.
 *
 * It states the gesture rather than apologising for the emptiness. An index
 * with nothing open is the normal state of this screen, not a failure of it
 * (hard rule 6).
 */
export function DetailPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border px-6 py-16">
      <p className="text-center text-sm text-subtle-fg">{children}</p>
    </div>
  )
}
