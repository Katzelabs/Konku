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
 * ── What I2 changes here ────────────────────────────────────────────────────
 *
 * The resolution order is account setting → `Accept-Language` → `id` (D-094).
 * Two halves of that belong in this file, and neither is implemented:
 *
 *   1. **`navigator.language`**, folded in below where it is marked. It is the
 *      client-side half of `Accept-Language` and it is available synchronously,
 *      which is what makes it usable here. A stranger's first visit has no
 *      cache, so without it their first paint is Indonesian whatever their
 *      browser asked for.
 *   2. **`rememberLocale()` must be called whenever resolution produces an
 *      answer** — when `/auth/me` returns the account's setting, and when the
 *      user changes it. Nothing else writes the cache, so skipping that call
 *      means every reload paints the previous language until the account loads.
 *
 * The cache is a *hint about the next boot*, never the source of truth. The
 * account setting outranks it the moment it arrives, and `LocaleProvider`
 * switches without a flash when it does.
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

  // I2: `navigator.language` goes here, and only here. An effect that corrects
  // the locale after mount is the flash this file exists to prevent.

  return 'id'
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
