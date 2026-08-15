import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { DomainId, FocusSession, Page } from '../../api/types'

// useDomains moved to features/domains: domains became per-user and editable
// (D-046), so they are no longer a fetch-once constant that happens to live
// next to the timer.

export const sessionKeys = {
  all: ['sessions'] as const,
  recent: (limit: number) => [...sessionKeys.all, limit] as const,
}

export interface SessionInput {
  domainId: DomainId | null
  durationMinutes: number
  /** The client's LOCAL YYYY-MM-DD. The server stores it as sent. */
  sessionDate: string
}

/**
 * The session log, newest first.
 *
 * A record of what happened, not a scorecard — see the handler comment. The
 * limit is a window, not a page: there is deliberately no "load more" and the
 * request sends no offset, because scrolling back through months of sessions
 * is the Activity log (PRD §5.10) and that is deferred.
 *
 * `total` is how many sessions exist, which is a different claim from how many
 * are shown. Without it the panel could not tell thirty-of-thirty from
 * thirty-of-three-hundred, and a window that looks like the whole log is the
 * half of D-084's bug that misinforms rather than hides.
 */
export function useSessions(limit = 30) {
  const query = useQuery({
    queryKey: sessionKeys.recent(limit),
    queryFn: () => api.get<Page<FocusSession>>(`/sessions?limit=${limit}`),
  })

  return {
    ...query,
    sessions: query.data?.items,
    total: query.data?.total ?? 0,
    /** True when the log runs deeper than this window shows. */
    truncated: (query.data?.total ?? 0) > (query.data?.items.length ?? 0),
  }
}

export function useLogSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SessionInput) => api.post<FocusSession>('/sessions', input),
    // The session that just ended has to appear in the log underneath the
    // timer without a refresh — it is the one entry the user is looking for.
    // Braces, not a returned promise — see the frontend conventions in
    // CLAUDE.md. Returning the invalidate makes mutate's callbacks wait on a
    // refetch that may 404 on the row just deleted, and then never run.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKeys.all })
    },
  })
}
