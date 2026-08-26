/**
 * Domains copy — ticket 11 I5.
 *
 * ONE AREA PER DIRECTORY, and this directory is owned by whoever is converting
 * `web/src/features/domains/`. Nothing outside it should be edited to add a
 * string here: that is the whole reason the catalog is split this way, so six
 * people can convert six features at once without meeting in one file.
 *
 * The rules, restated because this is where they get broken:
 *
 *   - The path is the id. Name a leaf for what it *is* on the screen, never
 *     for what it says. `emptyState.title`, not `belumAdaDomain`.
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
 * ## "Domain" is the same word in both catalogs, on purpose
 *
 * It is already an English word, used here as the product's own technical term
 * for a subject area, and it is what `domains.label` is called in the API, the
 * schema and every decision record. Glossing it — "subject", "topic", "area" —
 * would invent a second vocabulary for one concept and make the English half
 * of the app describe a thing the Indonesian half does not have. So the noun
 * stays; only the sentences around it are translated. It is *not* marked
 * `i18n-exempt` either: it is a real key, it is simply the same string twice.
 *
 * ## What is deliberately not in here
 *
 * **A colour name.** Domain colours are user data — the one exception to the
 * design system's no-raw-colour rule — and a label a person typed is never
 * copy. The palette swatches are named by `components/ui/color-picker.tsx`.
 *
 * **Anything that makes the weekly target a debt.** It points a direction; it
 * is not a quota owed, and zero is a normal answer that keeps the domain
 * usable. Hard rule 6 governs this screen more than any other in the slice.
 *
 * `noun` below is read by `features/cards/CardEditorPage.tsx` for its property
 * row, which is a cross-area *read* and is fine. Writing a domains string into
 * the cards catalog because that screen shows both would not be.
 */

export interface DomainsCopy {
  /** The screen (`/domains`), inside the settings shell (D-079). */
  title: string
  description: string

  /**
   * The name of one domain, as a field label elsewhere — the card editor's
   * property row. Separate from `title`, which names a screen listing all of
   * them, even though English is the only language where the two differ.
   */
  noun: string

  add: string

  empty: {
    title: string
    description: string
  }

  /** Above the archived ones, when there are any. */
  archivedHeading: string

  /** Creating one, and editing one. Same fields, so same keys. */
  form: {
    /** The visible `<label>` when creating; the `aria-label` when editing. */
    label: string
    placeholder: string
    /** The number field. A direction, never a debt — see the header. */
    quota: string
    save: string
    cancel: string
  }

  /** One row in the list. */
  row: {
    /** The weekly target, stated. */
    perWeek: (n: number) => string
    /** A target of zero. The domain still works; it just sits out. */
    outOfRotation: string
    edit: string
    archive: string
    /** Puts an archived one back in use. */
    unarchive: string
    delete: string
  }
}
