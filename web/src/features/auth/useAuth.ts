import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../api/client'

export interface User {
  id: string
  email: string
}

export const meQueryKey = ['auth', 'me'] as const

/**
 * The current user, or null when signed out.
 *
 * A 401 is a normal answer here, not an error — it means "not signed in".
 * Letting it surface as an error would make the app flash a failure state on
 * every cold load for a logged-out visitor.
 */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async (): Promise<User | null> => {
      try {
        return await api.get<User>('/auth/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      api.post<User>('/auth/login', creds),
    onSuccess: (user) => {
      qc.setQueryData(meQueryKey, user)
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => {
      // Clear everything, not just the user: cached notes and due cards belong
      // to the account that just signed out and must not leak into the next.
      qc.clear()
      qc.setQueryData(meQueryKey, null)
    },
  })
}
