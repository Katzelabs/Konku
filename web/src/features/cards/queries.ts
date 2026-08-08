import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { PickableCard } from '../../api/types'

export const cardKeys = {
  all: ['cards'] as const,
  list: (domainId: string | null) => [...cardKeys.all, 'list', domainId] as const,
}

/** The server caps this at 500; 200 is its default. */
export const CARD_LIMIT = 500

/**
 * Every card in the account, newest note first, prompts only.
 *
 * The same endpoint the exam card picker uses. It returns the front and the
 * note it came from — there is no per-card schedule state in the API, so this
 * screen shows where cards live, not how well they are known.
 */
export function useCards(domainId: string | null) {
  return useQuery({
    queryKey: cardKeys.list(domainId),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(CARD_LIMIT) })
      if (domainId) params.set('domainId', domainId)
      return api.get<PickableCard[]>(`/cards?${params}`)
    },
  })
}
