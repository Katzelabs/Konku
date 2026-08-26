import { use } from 'react'
import { useLocale } from '../index'
import type { Locale } from '../types'
import type { LegalCopy } from './types'

export type { Block, LegalCopy, LegalDocument, Section } from './types'
export { CONTACT_EMAIL, PRIVACY_SECTIONS, SELF_HOSTING_URL, TERMS_SECTIONS } from './types'

/**
 * The legal copy, loaded on demand and read through Suspense.
 *
 * ## Why both locales are lazy here, when `i18n/index.tsx` keeps `id` static
 *
 * Up there the asymmetry is load-bearing: Indonesian is the fallback for the
 * whole application, so it can never be a network request — a dropped
 * connection has to render Indonesian rather than nothing. Down here there is
 * no application to keep running. These two documents are reached at exactly
 * two URLs, both of which are already `lazy()` routes, and if the chunk does
 * not arrive the honest answer is the error boundary rather than half a policy.
 *
 * What that buys is the entry chunk: `npm run check:bundle` gates the
 * signed-out download at 140 kB, and neither of these documents costs it a
 * byte in either language.
 *
 * ## Why `use()` rather than a loading state
 *
 * `App.tsx` already wraps `/privacy` and `/terms` in `<PageChunk>`, which is a
 * `<Suspense>` around the route's own chunk. `use()` suspends into that
 * boundary, so the copy arrives on the same spinner the page module does and
 * neither screen grows a second loading branch. It also means there is no
 * moment where an English reader is shown Indonesian first, which is the flash
 * `bootLocale()` exists to prevent for the rest of the app (D-086).
 *
 * The promise is cached per locale, which is what makes this safe to call from
 * render at all: `use()` on a promise created during render would start a new
 * fetch on every attempt, and StrictMode's double mount would make that two
 * before the page ever settles.
 */
const cache = new Map<Locale, Promise<LegalCopy>>()

/**
 * What has already arrived.
 *
 * Same shape as `loaded` in `i18n/index.tsx`, and for a reason worth stating:
 * `use()` on a plain promise suspends *even when that promise has already
 * resolved*, because React tracks resolution by tagging the thenable and an
 * untagged one has to be awaited to be read. Without this map, navigating back
 * to `/privacy` would throw the page away and re-run the boundary for copy that
 * is already in memory.
 */
const loaded = new Map<Locale, LegalCopy>()

/**
 * Fetch a locale's legal copy, once.
 *
 * Written as two literal specifiers rather than a template: a template is a
 * glob to the bundler, which would pull every file in this directory — both
 * languages and the coverage map — into each chunk.
 */
export function loadLegal(locale: Locale): Promise<LegalCopy> {
  const already = cache.get(locale)
  if (already) return already

  const promise = (locale === 'en' ? import('./en').then((m) => m.en) : import('./id').then((m) => m.id)).then(
    (copy) => {
      loaded.set(locale, copy)
      return copy
    },
  )

  // Cached before it settles, so concurrent callers share one fetch. A
  // rejection is *not* cached: a failed chunk that can never be retried would
  // make a dropped connection permanent for the life of the tab.
  promise.catch(() => cache.delete(locale))
  cache.set(locale, promise)
  return promise
}

/**
 * The legal copy for the active locale.
 *
 * Suspends until it arrives, into the `<Suspense>` that `App.tsx` already wraps
 * both routes in. Only the two legal pages call this; every other screen reads
 * `useCopy()`, which is synchronous and always will be.
 *
 * `use()` is the one hook that may be called conditionally, which is what lets
 * a second visit read straight out of `loaded` instead of suspending again.
 */
export function useLegalCopy(): LegalCopy {
  const locale = useLocale()
  const ready = loaded.get(locale)
  if (ready) return ready
  return use(loadLegal(locale))
}
