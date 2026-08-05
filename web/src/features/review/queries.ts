import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { CardAnswer, DueList, Rating, RatingResult } from '../../api/types'
import { noteKeys } from '../notes/queries'

export const reviewKeys = {
  all: ['review'] as const,
  due: () => [...reviewKeys.all, 'due'] as const,
  answer: (noteId: string, cardId: string) => [...reviewKeys.all, 'answer', noteId, cardId] as const,
}

export function useDueCards() {
  return useQuery({
    queryKey: reviewKeys.due(),
    queryFn: () => api.get<DueList>('/review/due'),
    // The due set is a fact about today, not about this second. Refetching it
    // mid-session would shuffle the deck under the person reviewing it.
    staleTime: Infinity,
  })
}

/**
 * The answer, fetched only once the user has chosen to reveal.
 *
 * `enabled` is what enforces recall-before-reveal on the client (D-003): while
 * it is false no request is made, so the answer is not in memory, not in the
 * DOM, and not in the network log. The server withholding it is the real
 * guarantee; this makes sure the client never asks early either.
 */
export function useAnswer(noteId: string, cardId: string, reveal: boolean) {
  return useQuery({
    queryKey: reviewKeys.answer(noteId, cardId),
    queryFn: () => api.get<CardAnswer>(`/review/${noteId}/${cardId}/answer`),
    enabled: reveal,
    staleTime: Infinity,
    gcTime: 0,
  })
}

export function useRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { noteId: string; cardId: string; rating: Rating }) =>
      api.post<RatingResult>(`/review/${v.noteId}/${v.cardId}`, { rating: v.rating }),
    onSuccess: (_result, v) => {
      // The answer is not kept around after the card is done with.
      qc.removeQueries({ queryKey: reviewKeys.answer(v.noteId, v.cardId) })
      qc.invalidateQueries({ queryKey: noteKeys.list() })
    },
  })
}
