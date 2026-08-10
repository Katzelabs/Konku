import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../api/client'

export interface User {
  id: string
  email: string
  /**
   * False until the address is confirmed (07 L3).
   *
   * An unverified account can hold a session but every data route answers 403
   * `email_unverified`, so this is what lets the app show "check your mail"
   * instead of letting the first request fail and look like a bug.
   */
  emailVerified: boolean
}

export const meQueryKey = ['auth', 'me'] as const
export const authConfigQueryKey = ['auth', 'config'] as const

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

/**
 * Whether this instance accepts public signups.
 *
 * The login screen needs it before anyone has signed in, so that it neither
 * shows a link that 404s nor hides one that works. Cached indefinitely: it
 * changes only with a redeploy.
 */
export function useAuthConfig() {
  return useQuery({
    queryKey: authConfigQueryKey,
    queryFn: () => api.get<{ allowSignup: boolean }>('/auth/config'),
    staleTime: Infinity,
    retry: false,
  })
}

/**
 * Create an account.
 *
 * Answers 204 with no session — the account exists but is unverified, and
 * verification is a separate act from signing in. The caller's job on success
 * is to say "check your mail", not to navigate into the app.
 *
 * Note it answers 204 for an address that is already registered too, so a
 * success here does not mean an account was created. That is deliberate: a
 * form that says "already taken" is an account-existence oracle (D-039).
 */
export function useSignup() {
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      api.post<void>('/auth/signup', creds),
  })
}

/**
 * Spend a verification token.
 *
 * A query keyed by the token, not a mutation, even though it POSTs.
 *
 * The reason is StrictMode, and it is not theoretical: `main.tsx` wraps the
 * app in it, so in development React mounts, unmounts and remounts every
 * component. A mutation's observer does not survive that — the result of a
 * send that already succeeded is discarded, and the page sits on its spinner
 * forever after a verification that actually worked. A dev-only hang on the
 * one screen a new account cannot get past.
 *
 * Keying by the token fixes both halves at once: React Query shares the
 * in-flight promise, so the double mount cannot spend the token twice, and the
 * settled result is cached, so the remount reads it instead of starting over.
 * `enabled` keeps it from firing at all when the link carried no token.
 */
export function useVerifyToken(token: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['auth', 'verify', token],
    queryFn: async () => {
      await api.post<void>('/auth/verify', { token })
      // Whoever is signed in — possibly nobody — has to be re-read, because
      // the verified flag is what every route gate checks.
      qc.invalidateQueries({ queryKey: meQueryKey })
      return true
    },
    enabled: token !== '',
    retry: false,
    // A spent token must never be retried or refetched: the second attempt
    // fails by design and would replace a success with an error.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
}

/**
 * Ask for a password-reset link.
 *
 * Always succeeds, for a registered address and an unregistered one alike, so
 * the screen must not report that a message was sent (D-039).
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.post<void>('/auth/forgot', { email }),
  })
}

/**
 * Install a new password from a reset link.
 *
 * A mutation, unlike verification, and correctly so: this one is fired by a
 * person submitting a form, not by an effect on mount, so the StrictMode
 * remount that broke `useVerifyToken` cannot lose its result — there is nothing
 * in flight when the component mounts.
 *
 * Every session for the account dies server-side, including this browser's, so
 * the cache is cleared rather than invalidated: anything already fetched
 * belongs to a session that no longer exists.
 */
export function useResetPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { token: string; password: string }) =>
      api.post<void>('/auth/reset', vars),
    onSuccess: () => {
      qc.clear()
      qc.setQueryData(meQueryKey, null)
    },
  })
}

/** Send a fresh verification link. Always succeeds, even for an address that has none. */
export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => api.post<void>('/auth/resend-verification', { email }),
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
