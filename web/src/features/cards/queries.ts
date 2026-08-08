import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Card, CardSummary } from '../../api/types'

export interface CardFilters {
  domainId?: string | null
  categoryId?: string | null
  q?: string
}

export const cardKeys = {
  all: ['cards'] as const,
  list: (f: CardFilters) =>
    [...cardKeys.all, 'list', f.domainId ?? null, f.categoryId ?? null, f.q ?? ''] as const,
  detail: (id: string) => [...cardKeys.all, 'detail', id] as const,
}

/** The server caps this at 500 and uses it as the default too. */
export const CARD_LIMIT = 500

/**
 * The card list — prompts only.
 *
 * `back` is not in this response by design (D-003); the editor fetches a
 * single card when it needs the answer. The same endpoint feeds the exam
 * picker, which is why every filter is optional.
 */
export function useCards(filters: CardFilters = {}) {
  return useQuery({
    queryKey: cardKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(CARD_LIMIT) })
      if (filters.domainId) params.set('domainId', filters.domainId)
      if (filters.categoryId) params.set('categoryId', filters.categoryId)
      if (filters.q?.trim()) params.set('q', filters.q.trim())
      return api.get<CardSummary[]>(`/cards?${params}`)
    },
  })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: cardKeys.all }),
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
