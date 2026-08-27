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
     * The spinner's label (`components/ui/spinner.tsx`), and the same word on
     * `LoadMore` while the next page is in the air.
     *
     * Separate from `working` and not a synonym for it: `working` is what a
     * *button you pressed* says about itself, and this is what a *region of
     * the screen* says about content that is not there yet. `Loading` shipped
     * as a default parameter — `label = 'Memuat…'` — which is the one place
     * copy hides from review, because it does not look like copy.
     */
    loading: string
    /**
     * Backs out of a dialog or a selection without doing anything.
     *
     * Here rather than in a feature because the two components that say it —
     * `confirm-dialog.tsx` and `selection-bar.tsx` — are shared, and between
     * them they put this word on the notes index, the cards index, both
     * editors and both previews. Four feature catalogs already carry their
     * own `cancel` for a form they own; those are theirs and are deliberately
     * left alone (ticket 11 I5).
     */
    cancel: string
    /** The × on a dialog. An accessible name — the control has no text. */
    close: string
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

    /**
     * The reveal toggle inside a password field (D-070).
     *
     * Both the `aria-label` and the `title`, and both say the *action* rather
     * than the state: a control labelled "Kata sandi terlihat" reads as a
     * status, and the label has to answer "what happens if I press this".
     * Shared by the three signed-out forms and by Ubah kata sandi in
     * Pengaturan, which is why it is not `auth`.
     */
    password: {
      show: string
      hide: string
    }

    /**
     * The bar that appears once rows are ticked on a list screen.
     *
     * Its vocabulary is about the *mechanism* rather than about what is
     * selected — "12 dipilih" is the same sentence over notes and over cards —
     * so it lives here and the per-row tick box takes its name from the caller,
     * which is the half that does differ.
     */
    selection: {
      /** How many rows are ticked. Counted, so 5.000 groups per locale. */
      count: (n: number) => string
      /** Ticks everything. The whole list fits on the loaded page. */
      selectAll: string
      /**
       * Ticks everything *on screen*, while the list has pages nobody has
       * loaded (D-084). Named for what it does rather than quietly meaning
       * less than it says: "semua" beside a header reading "300 catatan"
       * would promise 300 and act on 50.
       */
      selectAllLoaded: string
      /** Unticks everything. The same box, the other way round. */
      clear: string
    }

    /**
     * The domain and category filters over the note and card indexes (D-078).
     *
     * The two group *names* are not here — they are `domains.noun` and
     * `categories.noun`, read across from the areas that own those words. What
     * is here is the dropdown's own furniture, which belongs to no feature.
     */
    filter: {
      searchDomains: string
      searchCategories: string
      /** The search matched nothing. About the query, never about the reader. */
      noMatch: string
      /** Drops every choice in this one group. */
      clearSelection: string
    }

    /**
     * The list/grid switch, which is the only control over those screens
     * (D-078). Icons only, so every one of these is an accessible name.
     */
    view: {
      label: string
      list: string
      grid: string
    }

    /**
     * The six swatches and the hex field, shared by domains and categories.
     *
     * Both area catalogs say in as many words that nothing in them describes a
     * colour and that the swatches are named here: a colour is user data, the
     * one documented exception to the design system's no-raw-colour rule.
     */
    color: {
      label: string
      /** One swatch, named by its hex value — there are no colour names. */
      swatch: (hex: string) => string
      /** The free-text field beside them. */
      hex: string
    }

    /**
     * The domain and category properties above a note or a card's title.
     *
     * `categories/types.ts` routes its create-on-type wording here explicitly:
     * that path is the highest-friction point in the app for capture (hard
     * rule 7), it is reached from the note editor and the card editor rather
     * than from `/categories`, and its copy therefore belongs with the picker
     * instead of with the tidying-up screen. The domain half is here for
     * symmetry — it is the same bar, drawn by the same file.
     */
    picker: {
      domain: {
        /** Nothing chosen yet. A prompt, not an error. */
        placeholder: string
        /** The explicit "no domain" choice in the menu. */
        none: string
      }
      category: {
        /** The property with no labels on it yet. */
        add: string
        search: string
        /**
         * Creating one by typing a name that does not exist (hard rule 7). The
         * quotation marks are the catalog's, because which pair of marks is
         * correct is a fact about the language.
         */
        create: (query: string) => string
        /** No categories at all yet, so the list has only the invitation. */
        empty: string
        /** Collapses the expanded picker. Nothing to save — it saves as it goes. */
        done: string
        /** The × on one chip. An accessible name, so it says which one. */
        remove: (label: string) => string
      }
    }

    /**
     * The card preview, which is a card with two sides (D-080).
     *
     * **Not recall-before-reveal, and nothing here may imply it is.** D-003 is
     * the server refusing to send `back` with a prompt; the peek already holds
     * the whole card. These words describe turning an object over, never a
     * test, a check, or an answer being released to you.
     *
     * Both take the side's own name as a value, because that name comes from
     * `cards.editor.{front,back}.label` and only the caller knows it.
     */
    flashcard: {
      /** The control under the card. Names the side you are going *to*. */
      showSide: (side: string) => string
      /** The live region, which is the only thing that announces the turn. */
      side: (side: string) => string
    }

    /** The preview over a list. Only the modal has a close — the side pane
     * has nothing to close *to* (D-078). */
    peek: {
      close: string
    }

    /**
     * The shell: the sidebar, the top bar, the breadcrumb trail and the
     * account menu.
     *
     * The *destination* names are not here. Beranda, Catatan, Kartu, Ulangan,
     * Timer and Pengaturan are read across from the areas that own those
     * screens, so the nav and the screen it opens cannot come to disagree
     * about what the screen is called. What is here is what the shell itself
     * says and no feature does.
     */
    nav: {
      /** First in the DOM, invisible until focused (F-12). */
      skipToContent: string
      /** The `<nav>` around the trail. Never rendered. */
      breadcrumb: string
      openSidebar: string
      closeSidebar: string
      /**
       * The trail's word for `/review/due`.
       *
       * Not `review.due.title`: the parent crumb already says Ulangan, and
       * "Ulangan / Ulangan hari ini" is the trail stuttering. It is the one
       * destination name the shell owns, and it owns it for that reason.
       */
      reviewToday: string
      /**
       * Finds a note by title. Titles only, and it says so — ranked full-text
       * search is deferred (D-031) and a box that looked like it searched
       * bodies would be a promise the server cannot keep.
       */
      searchNotes: {
        placeholder: string
        label: string
      }
      /** The avatar that opens the account menu. */
      account: string
      /**
       * Ends the session, from the account menu.
       *
       * `auth.checkMail.signOut` and `settings.sessions.signOut.action` are
       * the same word on two other screens. They stay where they are: each
       * names a control on a screen its own area owns, and collapsing three
       * contexts into one key is how a common namespace becomes a bag of
       * words with nothing for a translator to go on.
       */
      signOut: string
      /** The running session in the top bar, which is a link to `/timer`. */
      openTimer: string
      /** What the pill says it is. `timer.status.running` is "Berjalan",
       * which describes the clock; this names the session. */
      focus: string
    }

    /**
     * When the screen cannot show what was asked for. Neither is the reader's
     * doing and neither says it is (hard rule 6).
     */
    error: {
      /** A render threw and the boundary caught it (D-085). */
      crash: string
      /** The one action worth offering after a crash. */
      reload: string
      /** `/auth/me` did not answer at all. Not a 401 — that is "signed out". */
      unreachable: string
    }
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
