import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { DomainId, Note, NoteSummary } from '../../api/types'

export const noteKeys = {
  all: ['notes'] as const,
  list: () => [...noteKeys.all, 'list'] as const,
  detail: (id: string) => [...noteKeys.all, 'detail', id] as const,
}

export interface NoteInput {
  title?: string
  contentMd?: string
  domainId?: DomainId | null
}

export function useNotes() {
  return useQuery({
    queryKey: noteKeys.list(),
    queryFn: () => api.get<NoteSummary[]>('/notes'),
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
      qc.invalidateQueries({ queryKey: noteKeys.list() })
    },
  })
}

/**
 * Saves a note. The response carries the *stored* markdown, which is not
 * always what was sent: the parser writes IDs into new cards. The editor
 * replaces its buffer with it, and the list is invalidated because the card
 * count and the updated date both just moved.
 */
export function useSaveNote(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NoteInput) => api.patch<Note>(`/notes/${id}`, input),
    onSuccess: (note) => {
      qc.setQueryData(noteKeys.detail(note.id), note)
      qc.invalidateQueries({ queryKey: noteKeys.list() })
    },
  })
}
