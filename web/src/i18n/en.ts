import { auth } from './areas/auth/en'
import { cards } from './areas/cards/en'
import { categories } from './areas/categories/en'
import { domains } from './areas/domains/en'
import { home } from './areas/home/en'
import { notes } from './areas/notes/en'
import { review } from './areas/review/en'
import { settings } from './areas/settings/en'
import { timer } from './areas/timer/en'
import { pluralFor } from './plural'
import type { Copy } from './types'

/** English distinguishes one from other, and formats 5,000 with commas. */
const n = pluralFor('en')

/**
 * English — translated from `id.ts`, which is the original.
 *
 * The same strings in the same order. Nothing added because an English sentence
 * felt like it wanted one more word, and nothing dropped because it read
 * awkwardly. If a line genuinely cannot be said this way in English, the fix is
 * to change the Indonesian first and translate the new version — not to let the
 * two catalogs say different things.
 *
 * ## Read this before you translate anything
 *
 * **Never punitive** (hard rule 6) survives translation only if somebody is
 * watching, and English is where it fails. English has a far larger vocabulary
 * of gentle blame than Indonesian does, and every phrase in it sounds friendly:
 *
 *   - No *don't forget*, *remember to*, *make sure you*.
 *   - No *you missed*, *you fell behind*, *you haven't*, *overdue*.
 *   - No *keep your streak*, *stay on track*, *don't break the chain*.
 *   - No *oops*, *uh oh*, *sorry!*, no exclamation marks.
 *   - No urgency: nothing *expires*, nothing is *running out*, nothing is
 *     *waiting for you*.
 *
 * A missed day is normal and the copy treats it as normal. The nearest thing to
 * a rule of thumb: state the fact, then the action. "Sisanya besok." is "The
 * rest tomorrow." — not "You still have 30 cards to go!".
 *
 * `catalog.test.ts` fails on the phrases above. It catches the ones that keep
 * reappearing, and it is not a substitute for reading this paragraph — there
 * are more ways to blame someone in English than a test can list.
 *
 * ## Style
 *
 * Plain, direct, active voice, sentence case, no filler. Sentence case means
 * buttons read "Sign out", not "Sign Out". Say *you*, never *the user*. Prefer
 * the short word: *use*, not *utilise*; *end*, not *terminate*.
 *
 * ## Screen names — decided, do not relitigate
 *
 * | Indonesian | English |
 * |---|---|
 * | Ulangan  | **Review**   |
 * | Latihan  | **Practice** |
 * | Terhapus | **Deleted**  |
 *
 * The operator's decision. These are product vocabulary rather than strings —
 * D-075 – D-077 record Ujian being folded into Ulangan and a table renamed
 * specifically to end an ambiguity — so they were chosen once, deliberately,
 * and they are not a per-screen call. Use them; do not reopen them.
 *
 * **Deleted, not Trash**, and the reasoning is worth keeping because it is the
 * rule this whole catalog is built on rather than a matter of taste. Terhapus
 * literally means deleted. `/privacy` already bolds **Terhapus** as the
 * recoverable state and reserves *benar-benar dihapus* for the permanent one,
 * so the pair is load-bearing in a document that has a coverage test over it.
 * "Trash" would import a discarded-and-gone metaphor the Indonesian never had —
 * and D-069 is thirty days and recoverable, which is the opposite claim. That
 * is a rewrite, not a translation, and rewriting is the one thing `en.ts` is
 * not allowed to do.
 *
 * **Review has a known cost, accepted rather than overlooked.** One English
 * word now covers the feature, the `/review` route and the `review_logs` /
 * `review_runs` / `review_sets` tables, so "review" in English prose is
 * ambiguous in a way "Ulangan" is not. That was weighed and taken. It is not a
 * discovery, and it is not grounds to revisit the name.
 *
 * A name not in this table is still undecided. If a screen you are converting
 * needs one, leave an explicitly marked placeholder and say so — a placeholder
 * that reads like a decision is worse than a gap.
 */

export const en: Copy = {
  common: {
    working: 'One moment…',
    loading: 'Loading…',
    cancel: 'Cancel',
    close: 'Close',
    today: 'Today',
    yesterday: 'Yesterday',

    password: {
      show: 'Show password',
      hide: 'Hide password',
    },

    selection: {
      count: (count) => n(count, { other: '# selected' }),
      selectAll: 'Select all',
      // "Loaded", not "on this page": the list is one scroll with a button
      // under it, and it has no pages a reader could point at.
      selectAllLoaded: 'Select all loaded',
      clear: 'Clear selection',
    },

    filter: {
      searchDomains: 'Search domains…',
      searchCategories: 'Search categories…',
      noMatch: 'Nothing matches.',
      clearSelection: 'Clear selection',
    },

    view: {
      label: 'View',
      list: 'List view',
      grid: 'Grid view',
    },

    color: {
      label: 'Colour',
      swatch: (hex) => `Colour ${hex}`,
      hex: 'Colour code',
    },

    picker: {
      domain: {
        placeholder: 'Choose a domain',
        none: 'No domain',
      },
      category: {
        add: 'Add a category',
        search: 'Search or add a category…',
        // Curly double quotes, where Indonesian uses the same pair. Both
        // languages quote a name the reader just typed the same way, and the
        // marks are in the catalog so a language that quotes differently can
        // say so without touching the component.
        create: (query) => `Add “${query}”`,
        empty: 'No categories yet. Type to make one.',
        done: 'Done',
        remove: (label) => `Remove category ${label}`,
      },
    },

    flashcard: {
      // The side you are going *to*, not the gesture. "Flip the card" would be
      // honest about the mechanism and useless about the outcome. Nothing here
      // calls it revealing an answer — that is D-003, on another screen.
      showSide: (side) => `Show ${side.toLowerCase()}`,
      side: (side) => `Card side: ${side}`,
    },

    peek: {
      close: 'Close preview',
    },

    nav: {
      skipToContent: 'Skip to content',
      breadcrumb: 'Breadcrumb',
      openSidebar: 'Open sidebar',
      closeSidebar: 'Close sidebar',
      reviewToday: 'Today',
      searchNotes: {
        placeholder: 'Search note titles…',
        label: 'Search note titles',
      },
      account: 'Account',
      signOut: 'Sign out',
      openTimer: 'Open the timer',
      focus: 'Focus',
    },

    error: {
      // States what happened and that it has already been reported. No
      // apology, no "oops", and no suggestion that the reader did this.
      crash:
        'This part failed to render. The report has already been sent, so there is nothing for you to file.',
      reload: 'Reload the page',
      unreachable: 'Cannot reach the server. Try reloading the page.',
    },
  },

  auth,
  cards,
  categories,
  domains,
  home,
  notes,
  review,
  settings,
  timer,
}
