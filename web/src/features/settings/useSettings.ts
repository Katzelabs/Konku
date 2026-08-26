import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Locale } from '../../i18n'
import { meQueryKey, type User } from '../auth/useAuth'

/**
 * Per-account preferences (`user_settings`, migration 00007).
 *
 * **Not the theme.** That is per-device and stays in localStorage — the same
 * person on a phone at night and a laptop at noon wants different answers, and
 * syncing it would make one of those wrong (see `AppearanceSettings.tsx` and
 * `useTheme.tsx`). These are properties of the account, which is why they are
 * server state and why they travel with the export.
 */
export interface Settings {
  /** What an idle timer opens on. Bounded 1–480, matching a session's own cap. */
  defaultDurationMinutes: number
  /**
   * D-037's progressive focus N. No control yet — the feature it belongs to is
   * not built, and the column round-trips so that it is ready when it is.
   */
  focusStepN: number
  /** The weekly domain rota. Also not built, also round-tripped. */
  rotaEnabled: boolean
  /**
   * The language this account reads in, or `null` for "follow the browser"
   * (migration 00014, D-094).
   *
   * Null is a choice somebody can make and get back to, which is why it is
   * nullable rather than defaulted: pinning it to `'id'` would make the
   * setting one-way, and would pin every existing account to Indonesian the
   * first time they changed any *other* preference — the endpoint writes the
   * whole object.
   *
   * It is a `users` column rather than a `user_settings` one, for a reason
   * that is entirely server-side (see migration 00014: it has to be readable
   * from the query that turns a session into an identity, and RLS reaches only
   * the auth substrate there). The API hides that split — one object, one
   * PATCH, both writes in one transaction — so nothing on this side has to
   * know.
   */
  locale: Locale | null
}

export const settingsQueryKey = ['settings'] as const

export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => api.get<Settings>('/settings'),
    // Changes only when this person changes it, on a screen that invalidates
    // the key when they do.
    staleTime: 5 * 60_000,
  })
}

/**
 * Save the preferences.
 *
 * The whole object every time, matching the endpoint: a partial update would
 * need to tell "absent" from `false`, and `rotaEnabled: false` is a value
 * somebody means.
 */
export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (next: Settings) => api.patch<Settings>('/settings', next),
    onSuccess: (saved) => {
      // The stored row, written straight into the cache — the response is the
      // row rather than an echo of the request, so this cannot drift from what
      // the database actually holds. Braces, never a returned promise (see
      // CLAUDE.md).
      qc.setQueryData(settingsQueryKey, saved)

      // The language lives in two caches, because it is read from two places:
      // this one, which the Preferensi screen renders, and `auth/me`, which is
      // what `AppLocale` resolves from — /auth/me is the only account endpoint
      // an *unverified* account can reach, so it has to carry it too.
      //
      // Written rather than invalidated, and that is the difference between a
      // language that changes on the tap and one that changes a moment later:
      // an invalidate is a refetch, and the app would keep rendering the old
      // language until it landed. Braces, never a returned promise.
      qc.setQueryData(meQueryKey, (me: User | null | undefined) =>
        me ? { ...me, locale: saved.locale } : me,
      )
    },
  })
}
