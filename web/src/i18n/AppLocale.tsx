import { useEffect, type ReactNode } from 'react'
import { useMe } from '../features/auth/useAuth'
import { bootLocale, rememberLocale } from './boot'
import { isLocale, LocaleProvider } from './index'
import type { Locale } from './types'

/**
 * Resolution (ticket 11 I2), and the only thing that feeds `LocaleProvider`.
 *
 * The order is **account setting → browser → `id`** (D-094), which is the same
 * order `internal/api/locale.go` runs server-side. Both halves of it are
 * already written elsewhere; this component's whole job is to put them in that
 * order and hand the answer to the provider.
 *
 *   - The account setting arrives on `/auth/me` as `locale`, and is **null**
 *     when the account has never chosen. Null is the load-bearing value: it is
 *     what leaves the browser's answer standing. A server that defaulted the
 *     field to `'id'` would repaint an English reader's screen the instant the
 *     query settled.
 *   - The browser's answer is `bootLocale()`, which is `navigator.languages`
 *     behind the `localStorage` hint, and is synchronous by construction.
 *
 * ── Why this is a component and not a hook inside `main.tsx` ────────────────
 *
 * `useMe` needs a `QueryClientProvider` above it, so the locale provider had to
 * move inside the query provider. Both are still outside the router and
 * outside `ThemeProvider`, so every signed-out screen still has copy and a 401
 * still does not change the language mid-session — which were the two reasons
 * `LocaleProvider` was outermost in the first place.
 *
 * **The seam is unchanged.** `LocaleProvider` still takes exactly one `locale`
 * prop and still knows nothing about where it came from.
 *
 * ── Why `bootLocale()` is read on every render rather than memoised ─────────
 *
 * The cache it reads is written below, so it is not a constant: signing out
 * clears `me` while `konku.locale` still holds the language that account was
 * reading in, and the login screen should stay in it (`lib/storage.ts` keeps
 * the key across a sign-out for exactly that). A value captured at mount would
 * be the language from before the last account setting arrived. The read is a
 * `localStorage.getItem` in a try/catch, and this component re-renders only
 * when `useMe` changes.
 */
export function AppLocale({ children }: { children: ReactNode }) {
  const { data: me } = useMe()

  // `me?.locale` is `undefined` while the query is in flight and `null` for an
  // account that has never chosen. Both mean the same thing here — nothing
  // outranks the browser yet — which is why this is a truthiness check with a
  // validity guard rather than a null check: the field crosses the wire, and
  // an API response is not a place to trust a string blindly.
  const account = me?.locale
  const locale: Locale = isLocale(account) ? account : bootLocale()

  // The hint for the next boot, so a reload paints this language before React
  // mounts rather than after (D-086's shape). An effect and not a render-time
  // write: rendering must stay free of side effects, and the value this
  // records is only ever read by a *later* page load.
  useEffect(() => {
    rememberLocale(locale)
  }, [locale])

  return <LocaleProvider locale={locale}>{children}</LocaleProvider>
}
