import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Domain } from '../../api/types'

export const domainKeys = {
  all: ['domains'] as const,
  live: () => [...domainKeys.all, 'live'] as const,
  withArchived: () => [...domainKeys.all, 'withArchived'] as const,
}

/**
 * The domains a picker should offer: this user's, minus the archived ones.
 *
 * Domains used to be global reference data seeded by a migration and never
 * edited, so this was fetched once and kept forever. They are per-user and
 * editable now (D-046), so every mutation below invalidates the key.
 */
export function useDomains() {
  return useQuery({
    queryKey: domainKeys.live(),
    queryFn: () => api.get<Domain[]>('/domains'),
  })
}

/**
 * Archived domains included. A note or focus session tagged with one still has
 * to render its label, so the display path needs the full set even though the
 * pickers do not (D-051).
 */
export function useAllDomains() {
  return useQuery({
    queryKey: domainKeys.withArchived(),
    queryFn: () => api.get<Domain[]>('/domains?includeArchived=true'),
  })
}

export interface DomainInput {
  label: string
  color: string
  weeklyQuota: number
}

function useDomainMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: domainKeys.all }),
  })
}

export function useCreateDomain() {
  return useDomainMutation((input: DomainInput) => api.post<Domain>('/domains', input))
}

export function useUpdateDomain() {
  return useDomainMutation((v: { id: string } & Partial<DomainInput>) => {
    const { id, ...body } = v
    return api.patch<Domain>(`/domains/${id}`, body)
  })
}

export function useArchiveDomain() {
  return useDomainMutation((v: { id: string; archived: boolean }) =>
    api.post<Domain>(`/domains/${v.id}/${v.archived ? 'archive' : 'unarchive'}`),
  )
}

/**
 * Deleting only works for a domain nothing references. One with notes or
 * sessions comes back 409 with a message pointing at archiving instead
 * (D-051) — the caller shows `error.message` as-is, since it is already
 * user-facing Indonesian.
 */
export function useDeleteDomain() {
  return useDomainMutation((id: string) => api.del<void>(`/domains/${id}`))
}
