import { useMutation } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { DomainId, FocusSession } from '../../api/types'

// useDomains moved to features/domains: domains became per-user and editable
// (D-046), so they are no longer a fetch-once constant that happens to live
// next to the timer.

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
