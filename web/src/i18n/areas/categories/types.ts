/**
 * Categories copy — ticket 11 I5.
 *
 * ONE AREA PER DIRECTORY, and this directory is owned by whoever is converting
 * `web/src/features/categories/`. Nothing outside it should be edited to add a
 * string here: that is the whole reason the catalog is split this way, so six
 * people can convert six features at once without meeting in one file.
 *
 * The rules, restated because this is where they get broken:
 *
 *   - The path is the id. Name a leaf for what it *is* on the screen, never
 *     for what it says. `emptyState.title`, not `belumAdaKategori`.
 *   - A string with a value in it is a function, so its arity is typechecked
 *     and `Intl.PluralRules` stays in the language that has plurals.
 *   - A list is a tuple, so a translation that drops one fails the build.
 *   - `en` is *translated from* `id`, not written against the screen. Same
 *     claims, same order. Nothing added because an English sentence wanted one
 *     more clause, nothing dropped because it read awkwardly.
 *   - Never punitive (hard rule 6). English has a far larger vocabulary of
 *     gentle blame than Indonesian, and `catalog.test.ts` fails on a list of
 *     it. No "don't forget", no "you missed", no "keep your streak".
 *
 * ## What is deliberately not in here
 *
 * **A colour name.** Categories have a colour (D-074) and it is user data —
 * the one exception to the design system's no-raw-colour rule. The palette
 * swatches are named by `components/ui/color-picker.tsx` and a label a person
 * typed is never copy. Nothing in this file describes a colour.
 *
 * **The create-on-type flow's own words.** A category is made by typing a name
 * into a note or a card, and that path is the highest-friction point in the
 * app for capture (hard rule 7). Its copy lives with the property picker; this
 * area is the tidying-up screen, and the form here is the convenience rather
 * than the front door.
 *
 * `noun` below is read by `features/cards/CardEditorPage.tsx` for its property
 * row, which is a cross-area *read* and is fine. Writing a categories string
 * into the cards catalog because that screen shows both would not be.
 */

export interface CategoriesCopy {
  /** The screen (`/categories`), inside the settings shell (D-079). */
  title: string
  description: string

  /**
   * The name of one category, as a field label elsewhere — the card editor's
   * property row. Singular, and separate from `title`, which names a screen
   * listing all of them.
   */
  noun: string

  /** Opens the form. Tidying, not the front door — see the header. */
  add: string

  empty: {
    title: string
    description: string
  }

  /** Above the archived ones, when there are any. */
  archivedHeading: string

  /** Creating one, and renaming one. Same fields, so same keys. */
  form: {
    /** The visible `<label>` when creating; the `aria-label` when editing. */
    label: string
    placeholder: string
    save: string
    cancel: string
    /**
     * Renaming follows everywhere the label was applied, because there is one
     * row behind all of them. Only shown while editing an existing category.
     */
    renameNote: string
  }

  /** One row in the list. */
  row: {
    /**
     * How many notes and cards carry this category. It is the answer to "can
     * I delete this?", and why Delete may come back 409 (D-051).
     */
    used: (notes: number, cards: number) => string
    /** Nothing carries it. Lower case: it sits where the counts would. */
    unused: string
    edit: string
    archive: string
    /** Puts an archived one back in use. */
    unarchive: string
    delete: string
  }
}
