/**
 * Notes copy — ticket 11 I5.
 *
 * ONE AREA PER DIRECTORY, and this directory is owned by whoever is converting
 * `web/src/features/notes/`. Nothing outside it should be edited to add a
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
 * ## Two things about this feature in particular
 *
 * **Capture cost is the thing to protect** (hard rule 7). Every string on the
 * editor sits between somebody and a note they were about to write, so none of
 * them asks a question, confirms an intention, or explains a feature. The
 * status line is four words at most and the empty preview states a fact.
 *
 * **The thirty days is a promise, not a label** (D-069). A daily job removes
 * notes deleted more than thirty days ago, and the window is stated in every
 * delete dialog, in the Deleted view and in `/privacy`. It is therefore the one
 * number here that must not drift between the two languages — so it is a
 * *parameter*, `deleteWindowDays`, passed in from `RECOVERY_DAYS` in
 * `features/notes/queries.ts` and formatted per locale. A literal "30" written
 * into four sentences is four chances for a translation to say fourteen, and a
 * trash that empties itself earlier than it promised is exactly the silent
 * disappearance this product exists to prevent.
 *
 * The English vocabulary for that promise is not free either: `/privacy` says
 * "move to *Deleted* and can be restored for *30 days*. After that they are
 * permanently deleted" (`i18n/legal/en.ts`), so these sentences use the same
 * words. Two documents describing one guarantee in two vocabularies is how a
 * policy and a dialog quietly stop agreeing.
 */

export interface NotesCopy {
  /**
   * A note with no title, wherever one is displayed by name — the index row,
   * the peek's heading, the row checkbox's accessible name.
   *
   * One key rather than three because it is one fact about a note, and three
   * copies is three chances for the index and the preview of the same note to
   * disagree about what it is called.
   */
  untitled: string

  /** The index (`/notes`), in both view modes. */
  index: {
    title: string
    description: string
    /**
     * The whole collection, not the loaded page (D-084). Rendering the loaded
     * count here is what told an account holding 300 notes that it had 50.
     */
    count: (n: number) => string
    /**
     * What `LoadMore` counts, as a bare noun it drops into its own sentence.
     *
     * The sentence around it — "Muat lebih banyak (12 catatan lagi)" — is
     * built inside `components/ui/load-more.tsx`, which is shared with cards
     * and is outside `check-i18n`'s scope, so it is still Indonesian in both
     * locales. This key is the half that is ours. When that component is
     * converted it will want a counted function rather than a noun, and this
     * is the key that becomes it.
     */
    noun: string
    /** Creates an empty note and opens the editor on it. */
    newNote: string
    /** Opens the Deleted view, which is this same screen asked the other way. */
    openDeleted: string
    search: {
      /**
       * Titles only, and it says so. The search runs in SQL against
       * `notes_title_trgm_idx` (D-084); ranked full-text search is deferred
       * (D-031), so the placeholder must not promise the body.
       */
      placeholder: string
      /** For the screen reader. A placeholder is not a label (F-12). */
      label: string
    }
    /**
     * The second column with nothing peeked. In list view it is very nearly
     * unreachable — the top row opens itself on arrival (D-078) — so it says
     * what the column is for and asks for nothing.
     */
    pickOne: string
    /**
     * An empty library is a starting point, not a failure (hard rule 6). No
     * "you haven't written anything yet", no exhortation, no illustration of
     * disappointment: what the screen is, and how small the first note can be.
     */
    empty: {
      title: string
      description: string
    }
    /** Filters or a query matched nothing. A fact about the filter, not about you. */
    noMatch: string
    /** The row's tick box, which has no text beside it. */
    select: (title: string) => string
  }

  /** The same index, filtered to what has been deleted (00005, D-069). */
  deleted: {
    title: string
    /** States the thirty-day window. See the note at the top of this file. */
    description: (deleteWindowDays: number) => string
    /** Leaves the Deleted view for the live one. */
    back: string
    empty: {
      title: string
      description: string
    }
    restore: string
    restoring: string
  }

  /**
   * The line after a delete, offering the way straight back.
   *
   * One line, no warning tone and no countdown to catch: the notes are in
   * Deleted either way and this is the shortcut, not the only route.
   */
  undo: {
    moved: (n: number) => string
    action: string
  }

  /** Deleting, from the index selection, the peek, or the editor. */
  delete: {
    /** The button, and the dialog's confirm. Both say the same word. */
    action: string
    /** One note, the one the screen is already showing. */
    titleOne: string
    /** A selection on the index. */
    titleMany: (n: number) => string
    /**
     * Where the note goes, what goes with it, and how long it can come back.
     * Number-neutral, because one dialog serves both the single delete and the
     * selection. See the note at the top of this file about the window.
     */
    description: (deleteWindowDays: number) => string
  }

  /** The read-only preview beside the list, or over it (D-080, D-084). */
  peek: {
    /**
     * The dialog's accessible name when the note has no title of its own.
     *
     * Singular: this names one note. `index.title` is the same Indonesian word
     * naming the screen, and English has to choose between them.
     */
    fallbackTitle: string
    /** A note that exists and has no body yet. Not an error and not a prompt. */
    emptyBody: string
    /** Leaves the preview for the editor. */
    edit: string
  }

  /** The full-width editor (`/notes/:id`). Hard rule 7 lives here. */
  editor: {
    /** Back to the index. */
    back: string
    /** The explicit save. Autosave exists so forgetting it costs nothing. */
    save: string
    /** Property labels above the title, the way Notion puts them on a page. */
    domain: string
    category: string
    title: {
      /** Accessible name. The placeholder is gone the moment there is a title. */
      label: string
      placeholder: string
    }
    body: {
      label: string
      placeholder: string
    }
    /** The write / split / preview toggle. Split is hidden below `lg`. */
    mode: {
      write: string
      split: string
      preview: string
    }
    /** The preview column with nothing written yet. */
    previewEmpty: string
    /** The only destructive control on the screen (D-054). */
    delete: string
    /**
     * Four states, none of them an alarm.
     *
     * `retrying` is a promise the code keeps: the backoff in `NoteEditorPage`
     * is what makes it true, which is why it did not need softening. The text
     * is still in the box and another attempt is already scheduled.
     */
    status: {
      retrying: string
      saving: string
      unsaved: string
      saved: string
    }
  }
}
