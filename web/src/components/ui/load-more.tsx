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
 */
export function LoadMore({
  loaded,
  total,
  hasMore,
  loading,
  error,
  onLoadMore,
  noun,
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
  /** What is being counted, in Indonesian: "catatan", "kartu". */
  noun: string
  className?: string
}) {
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
          {loading
            ? 'Memuat…'
            : `Muat lebih banyak (${remaining} ${noun} lagi)`}
        </Button>
      )}
    </div>
  )
}
