import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { DomainId, Note, NoteSummary } from '../../api/types'

export const noteKeys = {
  all: ['notes'] as const,
  list: (f: NoteFilters = {}) =>
    [...noteKeys.all, 'list', f.domainId ?? null, f.categoryId ?? null] as const,
  detail: (id: string) => [...noteKeys.all, 'detail', id] as const,
}

export interface NoteInput {
  title?: string
  contentMd?: string
  domainId?: DomainId | null
  categoryIds?: string[]
}

export interface NoteFilters {
  domainId?: string | null
  categoryId?: string | null
}

export function useNotes(filters: NoteFilters = {}) {
  return useQuery({
    queryKey: noteKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.domainId) params.set('domainId', filters.domainId)
      if (filters.categoryId) params.set('categoryId', filters.categoryId)
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
