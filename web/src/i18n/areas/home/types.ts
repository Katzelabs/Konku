/**
 * Home copy — ticket 11 I5.
 *
 * ONE AREA PER DIRECTORY, and this directory is owned by whoever is converting
 * `web/src/features/home/`. Nothing outside it should be edited to add a
 * string here: that is the whole reason the catalog is split this way, so six
 * people can convert six features at once without meeting in one file.
 *
 * The rules, restated because this is where they get broken:
 *
 *   - The path is the id. Name a leaf for what it *is* on the screen, never
 *     for what it says. `emptyState.title`, not `belumAdaCatatan`.
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
 * ## Hard rule 6 is at its sharpest in this file
 *
 * This is the dashboard. It shows what is waiting and what was last worked on,
 * and **there is no standard here to have missed**: no streak, no daily
 * target, no completion percentage, no "you are on track". Every one of those
 * was in the Figma dashboard and every one is rejected (D-007, D-009, D-054),
 * so the copy cannot reintroduce one in a sentence.
 *
 * The two places English will try to:
 *
 *   1. **The due tile when the number is not zero.** "Sisanya besok." is "The
 *      rest tomorrow." — a fact about the cap (D-009), and the cap is the
 *      feature. Not "you still have 30 to go", not "30 waiting for you".
 *   2. **Every empty state.** "Belum ada catatan." is "No notes yet." — not
 *      "You haven't written anything yet", which grades an account for being
 *      new. `EmptyState` states a fact and offers the next action; see
 *      DESIGN.md §5, which uses this exact string as its example.
 *
 * Nothing here is addressed to a reader who owes the product anything.
 */

export interface HomeCopy {
  title: string
  description: string

  /** What is due today, from `/review/due` (D-009: the cap is the feature). */
  due: {
    title: string
    /**
     * The unit beside the count — "kartu", "cards".
     *
     * A plural with **no number in it**, which is unusual enough to say why:
     * the count is rendered three type sizes larger than its unit, so the two
     * cannot be one string without losing the design. Both languages this app
     * ships put the unit after the number, and a language that did not would
     * need the tile changed rather than the catalog.
     */
    cardsUnit: (n: number) => string
    /** Nothing is due. A normal day, said as one. */
    none: string
    /** More is due than the cap serves. States the cap; asks for nothing. */
    deferred: string
    /** Everything due fits inside the cap. */
    allToday: string
    action: string
  }

  /** The focus timer, described from here. */
  focus: {
    title: string
    description: string
    action: string
  }

  /** Start a note from the home screen, with nothing to fill in first. */
  capture: {
    title: string
    description: string
    action: string
  }

  /** The last six notes touched. */
  recent: {
    title: string
    /** The link out to the full index. */
    all: string
    empty: {
      title: string
      description: string
    }
    /** A note whose first line is still blank. Not an error and not a prompt. */
    untitled: string
  }

  domains: {
    title: string
    /** The link out to the domains screen. */
    manage: string
    empty: string
    /**
     * The weekly quota, as a direction marker rather than a debt (D-009).
     *
     * There is no progress bar beside it and nothing counted against it. A
     * translation that turns it into "3 of 3 this week" has invented the
     * target this product refuses to set.
     */
    weekly: (n: number) => string
    /** A domain with no quota. Lower case: it sits where the quota would. */
    outOfRotation: string
  }
}
