import type { Locale } from './types'

/**
 * The locale the first paint uses, answered synchronously.
 *
 * `main.tsx` calls this before it renders anything, so the right catalog can be
 * in memory before React mounts. That is the whole reason this file is separate
 * from resolution: resolution (I2) is allowed to be asynchronous — it ends at
 * an account setting behind `/auth/me` — and the first paint is not.
 *
 * The shape is `web/public/theme.js`'s, and for the same reason (D-086). The
 * theme lives in `localStorage` and is read by a blocking script because an
 * effect runs *after* the first paint by definition, so a dark-theme user saw
 * white and then a flip on every reload. A locale read after the first paint is
 * the same bug with words instead of colours, and worse: the wrong language is
 * legible, so somebody reads half a sentence before it changes underneath them.
 *
 * Unlike the theme this does not need a blocking `<script>`, because nothing is
 * painted until React mounts anyway — `index.html` has an empty `#root`. It
 * needs only to run before `createRoot`.
 *
 * ── How I2 resolves it ──────────────────────────────────────────────────────
 *
 * The resolution order is account setting → `Accept-Language` → `id` (D-094).
 * Two halves of it live in this file, and both are now implemented:
 *
 *   1. **`navigator.language`**, folded into `bootLocale()` below. It is the
 *      client-side half of `Accept-Language` and it is available
 *      synchronously, which is what makes it usable here. A stranger's first
 *      visit has no cache, so without it their first paint would be Indonesian
 *      whatever their browser asked for. Doing it in an effect would be the
 *      D-086 flash, and worse: a wrong language is *legible*.
 *   2. **`rememberLocale()` is called whenever resolution produces an
 *      answer** — `AppLocale` in `./AppLocale.tsx` is the one caller, and it
 *      covers both cases that produce one: `/auth/me` returning the account's
 *      setting, and the user changing it on the Preferensi screen (which
 *      writes the new value into that same query).
 *
 * The cache is a *hint about the next boot*, never the source of truth. The
 * account setting outranks it the moment it arrives, and `LocaleProvider`
 * switches without a flash when it does.
 *
 * It is kept across sign-out (see `lib/storage.ts`), so the login screen stays
 * in the language the person was just reading rather than snapping back.
 */

/** Where the boot hint lives. Swept on sign-out unless it is in the keep list. */
const KEY = 'konku.locale'

function isLocale(value: unknown): value is Locale {
  return value === 'id' || value === 'en'
}

/**
 * The locale to paint with, right now, with no awaiting and no throwing.
 *
 * Never throws: a private window, disabled storage, or a thumbnailer with a
 * hostile `localStorage` getter all end at the default rather than at a blank
 * page. Indonesian is the fallback by rule (hard rule 8), so the failure mode
 * is the documented one.
 */
export function bootLocale(): Locale {
  try {
    const cached = localStorage.getItem(KEY)
    if (isLocale(cached)) return cached
  } catch {
    // Storage unavailable. The default is the right answer.
  }

  return browserLocale() ?? 'id'
}

/**
 * What the browser asked for, if this app has copy for it.
 *
 * The client-side half of `Accept-Language`, and it must stay synchronous —
 * an effect that corrects the locale after mount is the flash this file exists
 * to prevent. `internal/api/locale.go` reads the header form of the same
 * preference for the server's own copy; the two answer the same question from
 * the same source and are expected to agree.
 *
 * `navigator.languages` rather than `navigator.language`: it is the ordered
 * list, so somebody whose first choice is a language this app does not have
 * still gets their second rather than the fallback. It is missing in a few
 * environments (and in jsdom, depending on the version), hence the fallback to
 * the singular.
 *
 * Only the primary subtag is compared, exactly as the server does: `en-GB`,
 * `en-US` and `en` are all English as far as two catalogs are concerned. A tag
 * this app has no copy for is skipped rather than matched — a locale with no
 * catalog behind it is the one answer that must never be returned.
 */
function browserLocale(): Locale | undefined {
  try {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const tag of tags) {
      const primary = String(tag).split('-')[0].toLowerCase()
      if (isLocale(primary)) return primary
    }
  } catch {
    // No navigator, or a hostile one. The default is the right answer.
  }
  return undefined
}

/**
 * Record the resolved locale for the next boot.
 *
 * Called by whatever resolves the locale, not by the provider — the provider is
 * told what to render and has no opinion about what should be remembered.
 */
export function rememberLocale(locale: Locale): void {
  try {
    localStorage.setItem(KEY, locale)
  } catch {
    // Storage unavailable. The next boot falls back, which is survivable.
  }
}
