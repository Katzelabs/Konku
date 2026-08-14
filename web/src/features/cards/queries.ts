import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../api/client'
import { PAGE_SIZE, nextOffset, pageItems, pageTotal } from '../../api/paging'
import type { BulkResult, Card, CardSummary, Page } from '../../api/types'

/**
 * Many domains and many categories (D-078).
 *
 * The server OR's within each group and AND's between them, so two domains
 * means either and a domain plus a category means both. Empty means no filter.
 */
export interface CardFilters {
  domainIds?: string[]
  categoryIds?: string[]
  q?: string
  /** The Terhapus view: the same list, filtered to what has been deleted. */
  deleted?: boolean
}

export const cardKeys = {
  all: ['cards'] as const,
  list: (f: CardFilters) =>
    [
      ...cardKeys.all,
      'list',
      // Sorted, so picking two domains in the other order is the same cache
      // entry rather than a second fetch of the same list.
      [...(f.domainIds ?? [])].sort().join(','),
      [...(f.categoryIds ?? [])].sort().join(','),
      f.q ?? '',
      f.deleted ?? false,
    ] as const,
  detail: (id: string) => [...cardKeys.all, 'detail', id] as const,
}

function cardsPath(filters: CardFilters, offset: number) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
  })
  // `append`, not `set`: the filter repeats the parameter rather than
  // packing a comma-separated list into one value, which is what the Go
  // handler reads with r.URL.Query()[name].
  for (const id of filters.domainIds ?? []) params.append('domainId', id)
  for (const id of filters.categoryIds ?? []) params.append('categoryId', id)
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (filters.deleted) params.set('deleted', 'true')
  return `/cards?${params}`
}

/**
 * The card list — prompts only, one page at a time.
 *
 * `back` is not in this response by design (D-003); the editor fetches a
 * single card when it needs the answer. The same endpoint feeds the fixed-set
 * picker, which is why every filter is optional.
 *
 * It used to ask for 500 in one request against a query with no OFFSET, so
 * card 501 was unreachable (D-084).
 */
export function useCards(filters: CardFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: cardKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.get<Page<CardSummary>>(cardsPath(filters, pageParam)),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    // Holds the current page while a changed filter loads, rather than
    // emptying the list between keystrokes. See the note in notes/queries.ts.
    placeholderData: keepPreviousData,
  })

  return {
    ...query,
    cards: pageItems(query.data?.pages),
    total: pageTotal(query.data?.pages),
  }
}

/** One card, with its answer. The only place `back` arrives outside review. */
export function useCard(id: string) {
  return useQuery({
    queryKey: cardKeys.detail(id),
    queryFn: () => api.get<Card>(`/cards/${id}`),
    enabled: id !== '',
  })
}

export interface CardInput {
  front: string
  back: string
  domainId?: string | null
  categoryIds?: string[]
}

function useCardMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    // Cards feed the review queue and the exam draw, so a change here can
    // alter what is due. Invalidating the whole key is cheap and avoids a
    // stale due list after an edit.
    // Braces, not a returned promise — see the frontend conventions in
    // CLAUDE.md. Returning the invalidate makes mutate's callbacks wait on a
    // refetch that may 404 on the row just deleted, and then never run.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cardKeys.all })
    },
  })
}

export function useCreateCard() {
  return useCardMutation((input: CardInput) => api.post<Card>('/cards', input))
}

export function useUpdateCard(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<CardInput>) => api.patch<Card>(`/cards/${id}`, input),
    onSuccess: (card) => {
      qc.setQueryData(cardKeys.detail(id), card)
      qc.invalidateQueries({ queryKey: cardKeys.all })
    },
  })
}

/**
 * Deleting is a soft delete: the schedule and the review history stay, so
 * restoring is a real undo rather than a fresh card wearing the old wording.
 */
export function useDeleteCard() {
  return useCardMutation((id: string) => api.del<void>(`/cards/${id}`))
}

export function useRestoreCard() {
  return useCardMutation((id: string) => api.post<void>(`/cards/${id}/restore`))
}

/**
 * The selection bar. The response carries how many rows actually changed,
 * which the screen reports — an id that had already gone is not counted.
 */
export function useDeleteCards() {
  return useCardMutation((ids: string[]) =>
    api.post<BulkResult>('/cards/bulk-delete', { ids }),
  )
}

export function useRestoreCards() {
  return useCardMutation((ids: string[]) =>
    api.post<BulkResult>('/cards/bulk-restore', { ids }),
  )
}
