import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'

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
    },
  })
}
