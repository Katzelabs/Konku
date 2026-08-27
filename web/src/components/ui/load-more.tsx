import { useCopy } from '../../i18n'
import { Button } from './button'
import { Notice } from './notice'
import { cn } from '../../lib/utils'

/**
 * The end of a paged list (D-084).
 *
 * A button, deliberately, and never a scroll sentinel that loads the next page
 * on its own. In list view the left column is a scroll container beside a live
 * preview and the top row opens itself on arrival (D-078); loading on scroll
 * would move the ground under both, and a reader who has scrolled to the
 * bottom to see how far the list goes would find that it never ends.
 *
 * It says how many are left, because the point of the whole change is that the
 * screen stops implying the collection ends where the page does.
 *
 * **It does not write that sentence.** It took a `noun` once — "catatan",
 * "kartu" — and built `${remaining} ${noun} lagi` around it, which meant an
 * English reader got an English noun inside an Indonesian sentence however
 * carefully the catalogs were translated. English also needs the noun to agree
 * with the count, which a bare noun cannot do. So the caller hands over a
 * counted function and this renders exactly what it returns (ticket 11 I5).
 */
export function LoadMore({
  loaded,
  total,
  hasMore,
  loading,
  error,
  onLoadMore,
  remainingLabel,
  className,
}: {
  /** Rows on screen. */
  loaded: number
  /** Rows matching the filters in all. */
  total: number
  hasMore: boolean
  loading: boolean
  error?: Error | null
  onLoadMore: () => void
  /**
   * The button's whole label, given how many rows are still unloaded.
   *
   * From the caller's own catalog — `c.index.loadMore` and its siblings — so
   * the count, the noun it agrees with and the word order are all decided in
   * the language being rendered.
   */
  remainingLabel: (remaining: number) => string
  className?: string
}) {
  const c = useCopy()

  // Nothing to say about a list that fits on one page.
  if (!hasMore && !error) return null

  const remaining = Math.max(total - loaded, 0)

  return (
    <div className={cn('flex flex-col items-start gap-2 px-1 pt-1', className)}>
      {/*
        A failed next page keeps the loaded rows on screen: losing what you
        were already reading because the page after it did not arrive would be
        the disappearance this list exists to prevent, in miniature.
      */}
      {error && <Notice>{error.message}</Notice>}
      {hasMore && (
        <Button variant="secondary" onClick={onLoadMore} disabled={loading}>
          {loading ? c.common.loading : remainingLabel(remaining)}
        </Button>
      )}
    </div>
  )
}
