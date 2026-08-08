import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type {
  Attempt,
  AttemptDetail,
  CardAnswer,
  Exam,
  ExamDetail,
  ExamSelection,
  CardSummary,
  Rating,
} from '../../api/types'

export const examKeys = {
  all: ['exams'] as const,
  list: () => [...examKeys.all, 'list'] as const,
  detail: (id: string) => [...examKeys.all, 'detail', id] as const,
  attempt: (id: string) => ['attempts', id] as const,
  answer: (attemptId: string, cardId: string) =>
    ['attempts', attemptId, 'answer', cardId] as const,
}

export function useExams() {
  return useQuery({
    queryKey: examKeys.list(),
    queryFn: () => api.get<Exam[]>('/exams'),
  })
}

export function useExam(id: string) {
  return useQuery({
    queryKey: examKeys.detail(id),
    queryFn: () => api.get<ExamDetail>(`/exams/${id}`),
  })
}

export interface ExamInput {
  title: string
  description?: string
  domainId: string | null
  selection: ExamSelection
  questionCount: number | null
  timeLimitMinutes: number | null
}

export function useCreateExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ExamInput) => api.post<Exam>('/exams', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.all }),
  })
}

export function useArchiveExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Exam>(`/exams/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.all }),
  })
}

export function useDeleteExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/exams/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.all }),
  })
}

/**
 * Starts a sitting, or hands back the one already in progress.
 *
 * Idempotent on the server: an exam has at most one open attempt, so pressing
 * "mulai" again after a refresh returns the same attempt with the same
 * questions rather than re-drawing (D-050).
 */
export function useStartAttempt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { examId: string; attemptDate: string }) =>
      api.post<AttemptDetail>(`/exams/${v.examId}/attempts`, { attemptDate: v.attemptDate }),
    onSuccess: (attempt) => {
      qc.setQueryData(examKeys.attempt(attempt.id), attempt)
      qc.invalidateQueries({ queryKey: examKeys.all })
    },
  })
}

export function useAttempt(id: string) {
  return useQuery({
    queryKey: examKeys.attempt(id),
    queryFn: () => api.get<AttemptDetail>(`/attempts/${id}`),
    // The question set is fixed for the sitting. Refetching mid-attempt would
    // reshuffle the screen under the person answering it.
    staleTime: Infinity,
  })
}

/**
 * The answer to one question, fetched only once the user chooses to reveal.
 *
 * `enabled` is what keeps recall-before-reveal honest on the client (D-003):
 * while it is false nothing is requested, so the answer is not in memory, the
 * DOM, or the network log. The server withholding it is the real guarantee.
 */
export function useAttemptAnswer(
  attemptId: string,
  cardId: string,
  reveal: boolean,
) {
  return useQuery({
    queryKey: examKeys.answer(attemptId, cardId),
    queryFn: () => api.get<CardAnswer>(`/attempts/${attemptId}/${cardId}/answer`),
    enabled: reveal,
    staleTime: Infinity,
    gcTime: 0,
  })
}

/**
 * Records one answer. It writes review_logs and never moves the schedule
 * (D-049), so no review query needs invalidating here.
 */
export function useAnswerQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { attemptId: string; cardId: string; rating: Rating }) =>
      api.post<void>(`/attempts/${v.attemptId}/${v.cardId}`, { rating: v.rating }),
    onSuccess: (_r, v) => {
      qc.removeQueries({ queryKey: examKeys.answer(v.attemptId, v.cardId) })
    },
  })
}

export function useFinishAttempt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attemptId: string) => api.post<Attempt>(`/attempts/${attemptId}/finish`),
    onSuccess: (_a, attemptId) => {
      qc.invalidateQueries({ queryKey: examKeys.attempt(attemptId) })
      qc.invalidateQueries({ queryKey: examKeys.all })
    },
  })
}

/** Candidate cards for pinning a fixed exam's question set. */
export function usePickableCards(domainId: string | null) {
  return useQuery({
    queryKey: ['cards', 'pickable', domainId] as const,
    queryFn: () =>
      api.get<CardSummary[]>(`/cards${domainId ? `?domainId=${domainId}` : ''}`),
  })
}

export function useSetExamCards() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { examId: string; cards: { cardId: string }[] }) =>
      api.put<void>(`/exams/${v.examId}/cards`, { cards: v.cards }),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: examKeys.detail(v.examId) }),
  })
}

export function useDiscardAttempt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attemptId: string) => api.del<void>(`/attempts/${attemptId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.all }),
  })
}
