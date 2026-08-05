import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Domain, DomainId, FocusSession } from '../../api/types'

export const domainKeys = { all: ['domains'] as const }

/**
 * Domains are global reference data seeded by the migration and never edited
 * from the app, so this is fetched once and kept.
 */
export function useDomains() {
  return useQuery({
    queryKey: domainKeys.all,
    queryFn: () => api.get<Domain[]>('/domains'),
    staleTime: Infinity,
  })
}

export interface SessionInput {
  domainId: DomainId | null
  durationMinutes: number
  /** The client's LOCAL YYYY-MM-DD. The server stores it as sent. */
  sessionDate: string
}

export function useLogSession() {
  return useMutation({
    mutationFn: (input: SessionInput) => api.post<FocusSession>('/sessions', input),
  })
}
