import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { BulkResult, DomainId, Note, NoteSummary } from '../../api/types'

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
      f.deleted ?? false,
    ] as const,
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
  /** The Terhapus view: the same list, filtered to what has been deleted. */
  deleted?: boolean
}

export function useNotes(filters: NoteFilters = {}) {
  return useQuery({
    queryKey: noteKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      // `append`, not `set`: the filter repeats the parameter rather than
      // packing a comma-separated list into one value, which is what the Go
      // handler reads with r.URL.Query()[name].
      for (const id of filters.domainIds ?? []) params.append('domainId', id)
      for (const id of filters.categoryIds ?? []) params.append('categoryId', id)
      if (filters.deleted) params.set('deleted', 'true')
      const query = params.toString()
      return api.get<NoteSummary[]>(query ? `/notes?${query}` : '/notes')
    },
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
