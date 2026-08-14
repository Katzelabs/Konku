import type { Page } from './types'

/**
 * Paging for the index lists (D-084).
 *
 * Both lists used to fetch one bounded slice and stop — `/notes` took the
 * server's default of 50 and `/cards` asked for 500 against an endpoint whose
 * query had no OFFSET at all. Everything past that existed, counted against
 * the account's quota and appeared in the export, but could not be reached
 * from the app. The screens then showed the length of that slice as the total.
 */

/**
 * One page. The server's default and its own idea of a page, restated here so
 * the client asks for what it means rather than inheriting a default it cannot
 * see. The server caps any request at 200.
 */
export const PAGE_SIZE = 50

/**
 * The offset of the next page, or undefined when the list is exhausted —
 * TanStack reads undefined as "no more pages" and turns `hasNextPage` off.
 *
 * Counted from the rows actually loaded rather than `offset + limit`, so a
 * short page (the server clamped the limit, or rows were deleted underneath)
 * cannot leave a gap the reader would never see.
 */
export function nextOffset<T>(last: Page<T>, all: Page<T>[]): number | undefined {
  const loaded = all.reduce((n, page) => n + page.items.length, 0)
  return loaded < last.total ? loaded : undefined
}

/** The rows of every page loaded so far, in order. */
export function pageItems<T>(pages: Page<T>[] | undefined): T[] {
  return pages?.flatMap((page) => page.items) ?? []
}

/**
 * How many rows match in all — not how many are loaded.
 *
 * Read off the newest page: every page refetches together when a mutation
 * invalidates the list, so the last one is the freshest answer to "how many
 * are there", and it is the number the screen puts in the header.
 */
export function pageTotal<T>(pages: Page<T>[] | undefined): number {
  return pages?.at(-1)?.total ?? 0
}
