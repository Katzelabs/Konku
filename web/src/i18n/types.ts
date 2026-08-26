/**
 * The copy contract.
 *
 * Both locales implement this one type, so a key that exists in Indonesian and
 * not in English is a compile error at `npm run typecheck` rather than a blank
 * line on a screen. This is the shape `Katzelabs/konku-landing/src/i18n` already
 * uses, adopted rather than invented (D-094).
 *
 * ## The rules that bind everything written against this type
 *
 * 1. **Indonesian is the original.** `id.ts` is authored; `en.ts` is
 *    *translated from it*, not rewritten against it — the same claims in the
 *    same order, nothing added because an English sentence wanted one more
 *    word, nothing dropped because it read awkwardly.
 *
 * 2. **Never punitive** (hard rule 6). It applies to both languages, and it is
 *    English that needs watching: it has a far larger vocabulary of gentle
 *    blame. See the header of `en.ts`, and `catalog.test.ts`, which fails on
 *    the phrases that keep reappearing.
 *
 * 3. **Plain, direct, active voice, sentence case, no filler.** Same clause in
 *    both languages.
 *
 * ## How to add a key
 *
 * Declare it here first. The two catalogs then fail to compile until they both
 * have it, which is the point — the type is the mechanism, and
 * `catalog.test.ts` is the second one (hard rule 9).
 *
 * **Naming.** The path *is* the id. Top level is the feature folder under
 * `web/src/features/` (`auth`, `cards`, `notes`, `review`, `settings`, `timer`,
 * `domains`, `categories`, `legal`, `home`), plus `common` for a string two or
 * more features genuinely share. Segments are camelCase. A leaf is named for
 * what it *is* on the screen — `title`, `description`, `emptyBody`, `endSession`
 * — never for what it says, because the thing it says is the half that changes
 * per locale. `settings.sessions.signOutOthers.action` reads as a location;
 * `settings.sessions.keluarkan` would be Indonesian leaking into the key space.
 *
 * **Lists are tuples**, as they are in the landing repo: three steps means
 * exactly three, and a translation that drops one fails the typecheck instead
 * of quietly rendering a shorter list than its counterpart.
 *
 * **A string with a value in it is a function**, not a template with
 * placeholders. Two reasons, both about keeping the type useful: calling it
 * with the wrong number of arguments is a compile error, which no string
 * catalog can give you; and plural selection then lives in the file for the
 * language that has plurals, so Indonesian is not forced to carry machinery for
 * a distinction it does not make. Each such function maps one-to-one onto an
 * ICU message if this ever outgrows a typed record, so the migration D-094 asks
 * to stay possible stays mechanical.
 *
 * Numbers inside those functions go through `pluralFor` in `plural.ts`, which
 * formats with `Intl.NumberFormat`. Never interpolate a raw number: Indonesian
 * writes 5.000 where English writes 5,000, and the quotas are in the thousands.
 */

/** The locale tags this app ships. Also valid BCP-47 tags for `Intl`. */
export type Locale = 'id' | 'en'

import type { AuthCopy } from './areas/auth/types'
import type { CardsCopy } from './areas/cards/types'
import type { CategoriesCopy } from './areas/categories/types'
import type { DomainsCopy } from './areas/domains/types'
import type { HomeCopy } from './areas/home/types'
import type { NotesCopy } from './areas/notes/types'
import type { ReviewCopy } from './areas/review/types'
import type { SettingsCopy } from './areas/settings/types'
import type { TimerCopy } from './areas/timer/types'

export interface Copy {
  /**
   * Strings used by two or more features. A string used by one feature belongs
   * in that feature's namespace, even if it looks generic — moving it here
   * "because it might be shared" is how a common namespace turns into a bag of
   * words with no context for a translator.
   */
  common: {
    /** On a button whose action is in flight. Not a spinner label. */
    working: string
    /**
     * Relative day labels, for a timestamp inside the last two days.
     *
     * They live here rather than in a feature because `lib/date.ts` produces
     * them and six screens render the result. Everything else about a date —
     * the month name, the digit grouping, the clock separator — comes from
     * `Intl` keyed on the active locale rather than from this catalog (D-094):
     * a month table written by hand is a translation nobody asked for and one
     * more thing to keep in step.
     */
    today: string
    yesterday: string
  }


  auth: AuthCopy
  cards: CardsCopy
  categories: CategoriesCopy
  domains: DomainsCopy
  home: HomeCopy
  notes: NotesCopy
  review: ReviewCopy
  settings: SettingsCopy
  timer: TimerCopy
}
