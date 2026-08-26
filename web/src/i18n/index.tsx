import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { id } from './id'
import type { Copy, Locale } from './types'

export type { Copy, Locale } from './types'
export { pluralFor, type PluralForms, type Pluralize } from './plural'
export { bootLocale, rememberLocale } from './boot'

/**
 * The one way a screen reads copy.
 *
 *     const c = useCopy()
 *     <h2>{c.settings.sessions.title}</h2>
 *     <p>{c.settings.sessions.ago.hours(3)}</p>
 *
 * That is the entire API, and it is **synchronous** — see the note on chunking
 * below, which is the reason it might not have been. There is no `t('some.key')`
 * either: the catalog is a plain typed object, so a wrong path is a compile
 * error, autocomplete works, and nothing parses a string at runtime (D-094).
 *
 * Outside React — a zod schema, a module-level table, an error formatter — take
 * `Copy` as an argument and let the caller get it from `useCopy()`, or use
 * `copyFor(locale)`. Do not import `id` directly to "just get a string": that
 * is how a screen ends up permanently Indonesian in a way nothing notices.
 *
 * ── Why English is behind a dynamic import ──────────────────────────────────
 *
 * Both catalogs used to sit in the entry chunk — the one a signed-out stranger
 * waits on, and the one `npm run check:bundle` gates at 140 kB. With one screen
 * converted that cost about a kilobyte. `11` I5 converts 551 literals across 41
 * files into two languages, all of it landing in that same chunk, spread over
 * six agents who would each see a passing build and leave the last one to merge
 * holding a budget nobody was tracking.
 *
 * So `en` is `import()`ed and `id` is not. Three properties fall out of that
 * asymmetry, and all three are the reason it is asymmetric rather than both
 * being lazy:
 *
 *   1. **Indonesian is the source language and the fallback** (hard rule 8), so
 *      the fallback is the one thing that must never be a network request. If
 *      the English chunk fails to arrive — a stale cache against a fresh
 *      deploy, a dropped connection — the app renders Indonesian. With both
 *      lazy it would render nothing.
 *   2. **No waterfall for the default locale.** An Indonesian visitor pays
 *      exactly what they paid before this split: no extra round trip, and copy
 *      in hand the moment the entry chunk parses.
 *   3. **`useCopy()` stays synchronous.** Nothing is suspended, no consumer
 *      grows a loading state, and I5's six agents write the same call they were
 *      briefed on. The waiting happens once, in `main.tsx`, before React
 *      mounts — never at a call site.
 *
 * The cost, stated plainly: an English visitor pays one extra round trip before
 * first paint. That is bounded by one small chunk and it is the price of not
 * flashing Indonesian at them, which is the failure `theme.js` exists to
 * prevent for the theme (D-086) and is no more acceptable here.
 */

/**
 * The catalogs that are in memory. `id` is always one of them, by construction:
 * it is statically imported above, so it is in the entry chunk and available
 * before anything can ask for it.
 */
const loaded: Partial<Record<Locale, Copy>> = { id }

/** In-flight loads, so StrictMode's double mount cannot fetch a chunk twice. */
const loading = new Map<Locale, Promise<Copy>>()

/** In the order a language switcher should list them. Indonesian is first. */
export const LOCALES: readonly Locale[] = ['id', 'en']

/**
 * Indonesian is the source language and the fallback (hard rule 8, D-094).
 * Anything that cannot resolve a locale lands here.
 */
export const DEFAULT_LOCALE: Locale = 'id'

export function isLocale(value: unknown): value is Locale {
  return value === 'id' || value === 'en'
}

/** Whether a locale's copy is in memory and can be read synchronously. */
export function catalogLoaded(locale: Locale): boolean {
  return loaded[locale] !== undefined
}

/**
 * Fetch a locale's catalog if it is not already in memory.
 *
 * Call this before rendering with a locale, not while rendering with it.
 * `main.tsx` awaits it at boot and `LocaleProvider` awaits it on a switch;
 * between them there is no third caller and no reason for one.
 */
export function loadCatalog(locale: Locale): Promise<Copy> {
  const already = loaded[locale]
  if (already) return Promise.resolve(already)

  const inFlight = loading.get(locale)
  if (inFlight) return inFlight

  // Only `en` is splittable — `id` is in `loaded` from the first line. Written
  // as a literal specifier rather than a template, because a template is a
  // glob to the bundler and would pull every file in this directory into the
  // lazy chunk.
  const promise = import('./en').then((module) => {
    loaded.en = module.en
    loading.delete(locale)
    return module.en
  })

  loading.set(locale, promise)
  return promise
}

/**
 * The catalog for a locale, synchronously.
 *
 * Falls back to Indonesian when the locale's chunk has not arrived, which is
 * the documented fallback rather than a papered-over failure (hard rule 8).
 * In practice it never fires for the *active* locale: `LocaleProvider` does not
 * switch to a locale until its catalog is in memory.
 */
export function copyFor(locale: Locale): Copy {
  return loaded[locale] ?? id
}

/*
 * ── The seam, and what fills it ────────────────────────────────────────────
 *
 * Resolution is not this module's job. `./AppLocale.tsx` owns it (I2), and the
 * order is account setting → browser → `id` (D-094) — the same order
 * `internal/api/locale.go` runs server-side, so a page and an API error cannot
 * arrive in different languages.
 *
 * **The seam is exactly one prop, and it stayed that way.** All of it arrives
 * as `locale` on `LocaleProvider` below, the loading is handled here, and no
 * screen changes.
 *
 * Two constraints the lazy split adds, both of which I2 designed around:
 *
 *   1. **The first paint's locale is known synchronously, before React
 *      mounts.** The account setting cannot be — it needs `/auth/me` — so the
 *      resolved locale is cached in `localStorage` and read back at boot by
 *      `bootLocale()` in `./boot`. `AppLocale` calls `rememberLocale()`
 *      whenever resolution produces an answer, which is what keeps that cache
 *      from being a language behind. Same shape and same reason as
 *      `web/public/theme.js` (D-086).
 *   2. **A stranger's very first visit has no cache**, so `bootLocale()`
 *      answers for them from `navigator.languages` — synchronously, inside
 *      that function, never in an effect after mount.
 *
 * The account setting is `users.locale` rather than a `user_settings` column,
 * which is a server-side detail with a real reason (migration 00014) and one
 * nothing on this side has to know: it arrives on `/auth/me` and on
 * `GET/PATCH /api/settings` either way.
 *
 * Changing `locale` at runtime is fine and is not a flash: the provider keeps
 * showing the language it has until the new catalog arrives, then swaps once.
 * That is a deliberate switch, which is a different thing from a first paint in
 * the wrong language.
 */

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

/**
 * Publishes the active locale to the tree, and keeps `<html lang>` in step
 * with it.
 *
 * `lang` matters more than it looks: it is what a screen reader picks a voice
 * from, and what a browser's translate prompt reads. `index.html` ships
 * `lang="id"` so the signed-out first paint is correct before React mounts;
 * this effect is what corrects it for an English account afterwards.
 *
 * The default context value is `DEFAULT_LOCALE`, so `useCopy()` works in a test
 * with no provider around it. That is deliberate — a hook that throws without a
 * provider would make every screen test carry a wrapper for a value it does not
 * care about.
 */
export function LocaleProvider({
  locale = DEFAULT_LOCALE,
  children,
}: {
  locale?: Locale
  children: ReactNode
}) {
  // The locale actually being rendered, which lags `locale` only for as long as
  // a chunk is in the air. Never renders a locale whose copy is not in memory.
  const [active, setActive] = useState<Locale>(() =>
    catalogLoaded(locale) ? locale : DEFAULT_LOCALE,
  )

  useEffect(() => {
    if (catalogLoaded(locale)) {
      setActive(locale)
      return
    }

    let cancelled = false
    loadCatalog(locale).then(
      () => {
        if (!cancelled) setActive(locale)
      },
      () => {
        // The chunk did not arrive. Indonesian is the fallback and is already
        // on screen, so there is nothing to do but keep it.
      },
    )

    return () => {
      cancelled = true
    }
  }, [locale])

  useEffect(() => {
    document.documentElement.lang = active
  }, [active])

  return <LocaleContext.Provider value={active}>{children}</LocaleContext.Provider>
}

/**
 * The active locale. A valid BCP-47 tag, so it goes straight into
 * `Intl.DateTimeFormat`, `Intl.NumberFormat` and friends — which is how dates
 * and numbers are formatted here, never by hand (D-094).
 */
export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/** The copy catalog for the active locale. */
export function useCopy(): Copy {
  return copyFor(useContext(LocaleContext))
}
