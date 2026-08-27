/**
 * Cards copy — ticket 11 I5.
 *
 * ONE AREA PER DIRECTORY, and this directory is owned by whoever is converting
 * `web/src/features/cards/`. Nothing outside it should be edited to add a
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
 * ## Two things this area has to keep straight, both of them decisions
 *
 * **A card is not a note with two fields** (D-055). There is no card *type*
 * here and there must never be one: cloze and feynman are deferred and the
 * deferral is restated every time somebody makes a type picker look easy. No
 * string in this file may imply a card has a kind. It has two sides, and that
 * is the whole of it.
 *
 * **The peek is not recall-before-reveal** (D-080). `CardPeek` shows both
 * sides because you opened that card on purpose to see what it says. D-003 is
 * the *server* refusing to send `back` with a prompt on the review screen, and
 * nothing in this file may describe the peek's flip as a test, a check, or an
 * answer being revealed to you. It is a card being turned over.
 *
 * The delete copy carries D-069's thirty days, and it carries the exemption
 * with it: a card that was ever reviewed is kept indefinitely, because
 * `review_logs` has no foreign key to `cards` and only the purge's predicate
 * stops it orphaning them. Both halves survive translation or the sentence is
 * a different promise in English than it is in Indonesian.
 */

export interface CardsCopy {
  /**
   * The index (`/cards`) and its Deleted view, which is the same screen with
   * `?deleted=true` rather than a route of its own.
   */
  index: {
    /** The screen. Also the label on the editor's back link. */
    title: string
    description: string
    /** The collection, not the page — the header states the real total. */
    count: (n: number) => string
    /**
     * The whole label on the button under the list, remainder and all.
     *
     * A bare noun before, which `components/ui/load-more.tsx` interpolated
     * into a sentence of its own — so the sentence stayed Indonesian however
     * the noun was translated. The component composes nothing now. Ticket 11
     * I5.
     */
    loadMore: (remaining: number) => string
    /** Takes you to the review queue, not into a set. */
    startReview: string
    newCard: string
    search: {
      placeholder: string
      /** The accessible name of the search box — no visible label. */
      label: string
    }
    /** The stretched click target on a row is named by the card's own front,
     * so this is only the tick box beside it. */
    selectCard: string
    /** The right-hand column with nothing open. List view only. */
    placeholder: string
    empty: {
      title: string
      description: string
    }
    /** Filters are on and nothing matched. Not the same as an empty account. */
    noMatch: string
    /** The bulk action on the selection bar. Deleting is soft, so the word is
     * the ordinary one and the dialog is where the consequence is stated. */
    delete: string
  }

  /**
   * The Deleted view (D-069). Thirty days, recoverable, and stated everywhere
   * a card can be deleted from.
   */
  deleted: {
    /** Opens the view. Also the view's own title. */
    title: string
    description: string
    /** Leaves it. */
    back: string
    empty: {
      title: string
      description: string
    }
    /** The offer after a delete. It restores exactly what went. */
    undo: {
      moved: (n: number) => string
      action: string
    }
    /** On the selection bar, in the Deleted view. */
    restore: string
    restoring: string
  }

  /** Deleting, from the index, the peek and the editor — one dialog, three
   * callers, so one set of keys. */
  confirmDelete: {
    one: string
    many: (n: number) => string
    /**
     * D-069, in full: where the card goes, what survives, and the two windows.
     * A card that was ever reviewed is kept indefinitely; one that never was
     * has thirty days. Both halves are load-bearing.
     */
    description: string
    confirm: string
  }

  /**
   * The preview over the list (D-080). A card with two sides, turned over —
   * not a test, and nothing here may say otherwise.
   */
  peek: {
    /** The panel's title. One card, so singular. */
    title: string
    edit: string
    delete: string
  }

  /** Create and edit one card (`/cards/new`, `/cards/:id`). */
  editor: {
    save: string
    saving: string
    /**
     * Leaving saves rather than warning, so this states which of the two
     * states the screen is in. A fact, not a nag (hard rule 6).
     */
    unsaved: string
    /**
     * The two sides. Named for the side of the card, not for the word on the
     * label — the label is the half that changes per locale, and `front` is
     * what the API, the schema and D-080 all call it.
     *
     * Each carries the visible `<label>` for its textarea, which is the
     * accessible name of the field (F-12): both sides of a card were
     * unlabelled to a screen reader until D-086 put a real one there.
     */
    front: {
      label: string
      placeholder: string
    }
    back: {
      label: string
      placeholder: string
    }
    markdownHint: string
    delete: string
  }
}
