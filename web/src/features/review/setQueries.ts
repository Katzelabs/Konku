import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../api/client'
import { PAGE_SIZE, nextOffset, pageItems, pageTotal } from '../../api/paging'
import { useCards } from '../cards/queries'
import type {
  AnswerResult,
  CardAnswer,
  Page,
  Rating,
  Run,
  RunDetail,
  ReviewSet,
  ReviewSetDetail,
  SetFormat,
  SetSelection,
} from '../../api/types'

/**
 * Saved review sets and the runs of them (D-075).
 *
 * The scheduled due queue lives in ./queries.ts. The two are one feature to the
 * user and two shapes to the client: the queue needs no configuration and moves
 * the schedule, a set is configured and never does.
 */
export const setKeys = {
  all: ['reviewSets'] as const,
  list: (archived: boolean) => [...setKeys.all, 'list', archived] as const,
  detail: (id: string) => [...setKeys.all, 'detail', id] as const,
  /**
   * A set's finished sittings. Under setKeys.all deliberately: finishing or
   * discarding a run already invalidates that key, and a history list keyed
   * outside it would keep showing a score the user just changed.
   */
  history: (setId: string) => [...setKeys.all, 'history', setId] as const,
  run: (id: string) => ['reviewRuns', id] as const,
  answer: (runId: string, cardId: string) =>
    ['reviewRuns', runId, 'answer', cardId] as const,
}

/**
 * The saved sets, one page at a time.
 *
 * `total` is how many exist, not how many are loaded. The endpoint had no
 * limit at all before this, so the screen asked for every set an account had
 * ever made — each row carrying three aggregate subqueries — on every visit.
 */
export function useReviewSets(archived = false) {
  const query = useInfiniteQuery({
    queryKey: setKeys.list(archived),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      })
      if (archived) params.set('archived', 'true')
      return api.get<Page<ReviewSet>>(`/review/sets?${params}`)
    },
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    placeholderData: keepPreviousData,
  })

  return {
    ...query,
    sets: pageItems(query.data?.pages),
    total: pageTotal(query.data?.pages),
  }
}

/**
 * A set's history: finished sittings, newest first, one page at a time.
 *
 * It used to arrive embedded in the set detail, capped at twenty by a constant
 * with no page after it, so the twenty-first sitting of a set was counted in
 * `runCount` and reachable by nothing (D-084's shape, in a corner the original
 * pass missed). The open run is not in here — it is `set.openRun`.
 */
export function useSetRuns(setId: string) {
  const query = useInfiniteQuery({
    queryKey: setKeys.history(setId),
    queryFn: ({ pageParam }) =>
      api.get<Page<Run>>(
        `/review/sets/${setId}/runs?limit=${PAGE_SIZE}&offset=${pageParam}`,
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  })

  return {
    ...query,
    runs: pageItems(query.data?.pages),
    total: pageTotal(query.data?.pages),
  }
}

export function useReviewSet(id: string) {
  return useQuery({
    queryKey: setKeys.detail(id),
    queryFn: () => api.get<ReviewSetDetail>(`/review/sets/${id}`),
  })
}

export interface ReviewSetInput {
  title: string
  description?: string
  selection: SetSelection
  questionCount: number | null
  timeLimitMinutes: number | null
  format: SetFormat
  domainIds: string[]
  categoryIds: string[]
}

export function useCreateReviewSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReviewSetInput) => api.post<ReviewSet>('/review/sets', input),
    // Braces, not a returned promise — see the frontend conventions in
    // CLAUDE.md. Returning the invalidate makes mutate's callbacks wait on a
    // refetch that may 404 on the row just deleted, and then never run.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: setKeys.all })
    },
  })
}

export function useArchiveReviewSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; archived: boolean }) =>
      api.post<ReviewSet>(`/review/sets/${v.id}/${v.archived ? 'archive' : 'unarchive'}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: setKeys.all })
    },
  })
}

export function useDeleteReviewSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/review/sets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: setKeys.all })
    },
  })
}

/**
 * Starts a sitting, or hands back the one already in progress.
 *
 * Idempotent on the server: a set has at most one open run, so pressing
 * "mulai" again after a refresh returns the same run with the same questions
 * and the same options rather than re-drawing (D-050).
 */
export function useStartRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { setId: string; runDate: string }) =>
      api.post<RunDetail>(`/review/sets/${v.setId}/runs`, { runDate: v.runDate }),
    onSuccess: (run) => {
      qc.setQueryData(setKeys.run(run.id), run)
      qc.invalidateQueries({ queryKey: setKeys.all })
    },
  })
}

export function useRun(id: string) {
  return useQuery({
    queryKey: setKeys.run(id),
    queryFn: () => api.get<RunDetail>(`/review/runs/${id}`),
    // The question set is fixed for the sitting. Refetching mid-run would
    // reshuffle the screen under the person answering it.
    staleTime: Infinity,
  })
}

/**
 * The answer to one recall question, fetched only once the user chooses to
 * reveal.
 *
 * `enabled` is what keeps recall-before-reveal honest on the client (D-003):
 * while it is false nothing is requested, so the answer is not in memory, the
 * DOM, or the network log. The server withholding it is the real guarantee.
 *
 * A choice question does not use this — committing to an option is the recall
 * attempt, and the answer comes back on the response to that.
 */
export function useRunAnswer(runId: string, cardId: string, reveal: boolean) {
  return useQuery({
    queryKey: setKeys.answer(runId, cardId),
    queryFn: () => api.get<CardAnswer>(`/review/runs/${runId}/${cardId}/answer`),
    enabled: reveal,
    staleTime: Infinity,
    gcTime: 0,
  })
}

/**
 * Records one answer. It writes review_logs and never moves the schedule
 * (D-049), so no due-queue query needs invalidating here.
 *
 * `rating` is for a recall question and `choice` for a multiple-choice one.
 * Which is required is decided by the question on the server, not here.
 */
export function useAnswerQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      runId: string
      cardId: string
      rating?: Rating
      choice?: number
    }) =>
      api.post<AnswerResult>(`/review/runs/${v.runId}/${v.cardId}`, {
        rating: v.rating,
        choice: v.choice,
      }),
    onSuccess: (_r, v) => {
      qc.removeQueries({ queryKey: setKeys.answer(v.runId, v.cardId) })
    },
  })
}

export function useFinishRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => api.post<Run>(`/review/runs/${runId}/finish`),
    onSuccess: (_a, runId) => {
      qc.invalidateQueries({ queryKey: setKeys.run(runId) })
      qc.invalidateQueries({ queryKey: setKeys.all })
    },
  })
}

/**
 * Candidate cards for pinning a fixed set's questions.
 *
 * The shared card list, filters and paging and all. It used to build its own
 * request for a single domain and drop the filter entirely when a set named
 * several — so a two-domain set was offered every card in the account — and it
 * read the first 500 as if they were all of them (D-084).
 */
export function usePickableCards(domainIds: string[]) {
  return useCards({ domainIds })
}

export function useSetReviewSetCards() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { setId: string; cards: { cardId: string }[] }) =>
      api.put<void>(`/review/sets/${v.setId}/cards`, { cards: v.cards }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: setKeys.detail(v.setId) })
    },
  })
}

export function useDiscardRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => api.del<void>(`/review/runs/${runId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: setKeys.all })
    },
  })
}
