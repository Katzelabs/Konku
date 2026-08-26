import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../api/client'
import { PAGE_SIZE, nextOffset, pageItems, pageTotal } from '../../api/paging'
import type { BulkResult, DomainId, Note, NoteSummary, Page } from '../../api/types'

/**
 * How long a deleted note can still be brought back (D-069).
 *
 * A daily job in the server process removes notes deleted more than this many
 * days ago, and the window is stated in every delete dialog, in the Deleted
 * view and in `/privacy`. It is a constant here rather than a literal in four
 * sentences because it is a *promise*: two languages times two screens is four
 * chances for one of them to say a different number, and a trash that empties
 * itself earlier than it said is the silent disappearance this product exists
 * to prevent. The copy takes it as an argument (`i18n/areas/notes`).
 *
 * It is not served by the API. If the server's window ever moves, this moves
 * with it — and `/privacy` says thirty days too, with a coverage test over it.
 */
export const RECOVERY_DAYS = 30

export const noteKeys = {
  all: ['notes'] as const,
  list: (f: NoteFilters = {}) =>
    [
      ...noteKeys.all,
      'list',
      // Sorted, so picking two domains in the other order is the same cache
      // entry rather than a second fetch of the same list.
      [...(f.domainIds ?? [])].sort().join(','),
      [...(f.categoryIds ?? [])].sort().join(','),
      f.q ?? '',
      f.deleted ?? false,
    ] as const,
  recent: (limit: number) => [...noteKeys.all, 'recent', limit] as const,
  detail: (id: string) => [...noteKeys.all, 'detail', id] as const,
}

export interface NoteInput {
  title?: string
  contentMd?: string
  domainId?: DomainId | null
  categoryIds?: string[]
}

/**
 * Many domains and many categories (D-078).
 *
 * The server OR's within each group and AND's between them, so two domains
 * means either and a domain plus a category means both. Empty means no filter.
 */
export interface NoteFilters {
  domainIds?: string[]
  categoryIds?: string[]
  /**
   * Title search, run in SQL since D-084. It used to be a filter over the
   * loaded page, which searched the first 50 notes and looked like it had
   * searched every one.
   */
  q?: string
  /** The Terhapus view: the same list, filtered to what has been deleted. */
  deleted?: boolean
}

function notesPath(filters: NoteFilters, offset: number) {
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
  return `/notes?${params}`
}

/**
 * The notes list, one page at a time.
 *
 * `total` is how many match the filters, not how many are loaded: the header
 * states it, and stating the loaded count there is the half of D-084's bug
 * that misinformed rather than hid.
 */
export function useNotes(filters: NoteFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: noteKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.get<Page<NoteSummary>>(notesPath(filters, pageParam)),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    // Typing in the search box changes the key, and without this the list
    // empties to a spinner between keystrokes — which also drops the row the
    // side preview is showing, since auto-select re-picks a top row that is
    // not there yet (D-078). Holding the previous page keeps the screen still.
    placeholderData: keepPreviousData,
  })

  return {
    ...query,
    notes: pageItems(query.data?.pages),
    total: pageTotal(query.data?.pages),
  }
}

/**
 * The handful of notes the home screen shows.
 *
 * A plain query asking for exactly what it renders, rather than an infinite
 * list sliced down to six. Keyed under noteKeys.all so every existing mutation
 * invalidation still reaches it.
 */
export function useRecentNotes(limit: number) {
  return useQuery({
    queryKey: noteKeys.recent(limit),
    queryFn: () => api.get<Page<NoteSummary>>(`/notes?limit=${limit}`),
    select: (page) => page.items,
  })
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: noteKeys.detail(id ?? ''),
    queryFn: () => api.get<Note>(`/notes/${id}`),
    enabled: Boolean(id),
    // The editor holds the authoritative text while it is open; refetching
    // underneath it would fight the person typing.
    staleTime: Infinity,
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NoteInput) => api.post<Note>('/notes', input),
    onSuccess: (note) => {
      qc.setQueryData(noteKeys.detail(note.id), note)
      qc.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

/**
 * Saves a note.
 *
 * The response used to carry markdown that differed from what was sent, since
 * the parser wrote card IDs into it and the editor had to adopt the result.
 * Nothing rewrites a note now (D-055), so the response is simply the stored
 * row. The list is still invalidated — the updated date just moved.
 */
export function useSaveNote(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NoteInput) => api.patch<Note>(`/notes/${id}`, input),
    onSuccess: (note) => {
      qc.setQueryData(noteKeys.detail(note.id), note)
      qc.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

/**
 * Deleting a note is a soft delete (00005): it leaves every normal path but
 * survives, keeps its labels, and comes back whole from the Terhapus view.
 *
 * Every one of these invalidates the whole `notes` key rather than patching
 * the cache. A delete moves a row between two lists — the live one and the
 * Terhapus one — and both are cached under that key, so surgically removing it
 * from one would leave the other wrong.
 */
function useNoteMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    // Braces, not a returned promise — see the frontend conventions in
    // CLAUDE.md. Returning the invalidate makes mutate's callbacks wait on a
    // refetch that may 404 on the row just deleted, and then never run.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

export function useDeleteNote() {
  return useNoteMutation((id: string) => api.del<void>(`/notes/${id}`))
}

export function useRestoreNote() {
  return useNoteMutation((id: string) => api.post<void>(`/notes/${id}/restore`))
}

/**
 * The selection bar. The response carries how many rows actually changed,
 * which the screen reports — an id that had already gone is not counted, so
 * the number shown is never larger than what happened.
 */
export function useDeleteNotes() {
  return useNoteMutation((ids: string[]) =>
    api.post<BulkResult>('/notes/bulk-delete', { ids }),
  )
}

export function useRestoreNotes() {
  return useNoteMutation((ids: string[]) =>
    api.post<BulkResult>('/notes/bulk-restore', { ids }),
  )
}
