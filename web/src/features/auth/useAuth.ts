import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../api/client'
import { clearAccountStorage } from '../../lib/storage'

export interface User {
  id: string
  email: string
  /**
   * The account's name, either half of which may be "" (migration 00010).
   *
   * Not optional in the type even though it is often empty: the server always
   * sends both keys, and "" is a value the UI acts on — it is what makes it
   * fall back to the address. Marking them `?` would let a caller confuse
   * "this account has no name" with "this response predates the field", which
   * are different things with the same fix and different bugs.
   *
   * Never read directly for display. `displayName.ts` owns the fallback, so
   * the same account is not greeted two ways on two screens.
   */
  firstName: string
  lastName: string
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
 * Drop the outgoing account's cache and report the app as signed out.
 *
 * The order is the whole point, and getting it backwards is what made logout
 * appear to do nothing.
 *
 * `queryClient.clear()` **removes** every query, and an observer bound to a
 * removed query is never notified: it keeps returning its last result until
 * something else re-renders it. `useMe` is called by `App`, while `useLogout`
 * is called by `AppShell` underneath it — so the settled mutation re-rendered
 * the child and left the parent holding the signed-in user. Writing null
 * afterwards did not help either, because `setQueryData` on a removed key
 * builds a *new* query that the stale observer is not watching. The cache was
 * genuinely empty and the screen genuinely did not care; only a reload, which
 * remounts the observer, got anyone to the login page.
 *
 * So: write null first, through the query the observer is actually bound to,
 * and only then remove the rest. `removeQueries` rather than `clear` because
 * `clear` would take `auth/me` straight back out again.
 *
 * Every path that ends a session goes through here — logout, revoking the
 * current session, a password reset, and deleting the account — because they
 * all had the same bug and it is not worth fixing four times.
 */
function reportSignedOut(qc: QueryClient) {
  qc.setQueryData(meQueryKey, null)
  // The other half of the same idea, and it was missing: the query cache is
  // not the only place the last account left something behind (F-10, see
  // lib/storage.ts).
  clearAccountStorage()
  qc.removeQueries({
    // Everything except who is signed in and what this instance allows.
    // Cached notes and due cards belong to the account that just left and
    // must not survive into the next one; `allowSignup` is instance config
    // with nobody's data in it, and dropping it would blink the signup link
    // off the login screen we are about to show.
    predicate: (q) =>
      !(q.queryKey[0] === 'auth' && (q.queryKey[1] === 'me' || q.queryKey[1] === 'config')),
  })
}

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
    mutationFn: (account: {
      email: string
      password: string
      firstName: string
      /** Optional; sent as "" when it was left blank (migration 00010). */
      lastName: string
    }) => api.post<void>('/auth/signup', account),
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
      reportSignedOut(qc)
    },
  })
}

/**
 * Change the password from inside the app.
 *
 * Deliberately does **not** report the user signed out, which is the one way it
 * differs from `useResetPassword` on the client. The server revokes every
 * *other* session and keeps this one, so the cache is still valid and clearing
 * it would drop the person to the login screen after an action that succeeded —
 * which reads as being punished for tightening their own security.
 *
 * The sessions list is invalidated instead, because the other devices this
 * account was signed in on have just disappeared from it. Braces, not a
 * returned promise: returning the invalidate would make the `mutate` callbacks
 * wait on the refetch (see CLAUDE.md).
 */
export function useChangePassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      api.post<void>('/auth/password', vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: authSessionsQueryKey })
    },
  })
}

/** Send a fresh verification link. Always succeeds, even for an address that has none. */
export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => api.post<void>('/auth/resend-verification', { email }),
  })
}

export interface AuthSession {
  /**
   * A public handle, never the session id.
   *
   * The session id is the credential (D-039), so the API deliberately never
   * sends it — if it did, every live session of the account would be readable
   * by any script on this page.
   */
  id: string
  /** The session making this request. Revoking it is a logout. */
  current: boolean
  createdAt: string
  lastSeen: string
  userAgent?: string
  ip?: string
}

export const authSessionsQueryKey = ['auth', 'sessions'] as const

/** Where the account is signed in (07 L5). */
export function useAuthSessions() {
  return useQuery({
    queryKey: authSessionsQueryKey,
    queryFn: () => api.get<AuthSession[]>('/auth/sessions'),
  })
}

/**
 * Sign out one session.
 *
 * Revoking the current one is a logout, so the cache is cleared in that case:
 * cached notes and due cards belong to a session that no longer exists.
 */
export function useRevokeAuthSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (session: AuthSession) => api.del<void>(`/auth/sessions/${session.id}`),
    onSuccess: (_data, session) => {
      // Braces, never a returned promise: returning the invalidate would make
      // the mutate callbacks wait on a refetch (see CLAUDE.md).
      if (session.current) {
        reportSignedOut(qc)
        return
      }
      qc.invalidateQueries({ queryKey: authSessionsQueryKey })
    },
  })
}

/** Sign out everywhere except here. */
export function useRevokeOtherAuthSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.del<void>('/auth/sessions'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: authSessionsQueryKey })
    },
  })
}

/**
 * Delete the account and everything in it (07 L7).
 *
 * Takes the password because the server requires it: a session is enough
 * authority to read and write notes, not to destroy the account irreversibly.
 *
 * On success the whole cache is cleared — every row it holds belongs to an
 * account that no longer exists — and the user is reported as signed out,
 * which drops the app back to the login screen.
 */
export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (password: string) => api.del<void>('/account', { password }),
    onSuccess: () => {
      reportSignedOut(qc)
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => {
      reportSignedOut(qc)
    },
  })
}
