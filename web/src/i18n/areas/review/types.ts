/**
 * Review copy — ticket 11 I5.
 *
 * ONE AREA PER DIRECTORY, and this directory is owned by whoever is converting
 * `web/src/features/review/`. Nothing outside it should be edited to add a
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
 * ── What this feature adds to those rules ──────────────────────────────────
 *
 * **This is the screen rule 6 is about.** Everything here counts something —
 * how many cards are scheduled, how far through a sitting you are, how many
 * you got — and a counted thing is one word away from a target you fell short
 * of. There is no target anywhere in this feature and there must not be copy
 * that implies one. `restTomorrow` is the shape to copy: state the fact, stop.
 * Nothing here congratulates either; an empty day is an ordinary day, so the
 * finished screen says "Done for today." and offers a link to somewhere else.
 *
 * **Format is a property of the set, never of a card** (D-076). `summary.choice`
 * and `summary.recall` describe how a *set* asks its questions, and the same
 * card is free recall in one set and multiple choice in another. No string here
 * may read as though a card has a type — that is the picker D-055 refused.
 *
 * **Recall before reveal is a server guarantee** (D-003), not a copy one.
 * `answering.reveal` labels the button that goes and *fetches* the back; it is
 * not un-hiding something already on the page. Copy that implies the answer was
 * there all along describes a mechanism this app deliberately does not have.
 *
 * ── Vocabulary, decided by the operator; see the header of `../../en.ts` ────
 *
 *   Ulangan → **Review** · Latihan → **Practice** · Terhapus → Deleted
 *
 * Two of the three live here. A saved *latihan* is a **practice set** — the
 * object is countable in English and "practice" alone is not — while the
 * section that holds them is **Practice**. "Review" also names the `/review`
 * route and the `review_logs` / `review_runs` / `review_sets` tables; that cost
 * was weighed and taken, and is not grounds to revisit the name.
 */

export interface ReviewCopy {
  /**
   * The feature's name. The header on `/review`, and the heading over both
   * screens that run cards — the due queue and one sitting of a set.
   */
  title: string
  description: string

  /**
   * The scheduled queue, which leads the merged screen and must keep leading
   * it: making the configurable half the front door would turn the automatic
   * queue into a thing you choose, which is the failure it exists to prevent.
   */
  due: {
    title: string
    /**
     * Nothing scheduled. Also the finished screen's heading on a day that
     * started empty, which is why it is one key and not two.
     */
    none: string
    ready: (n: number) => string
    /**
     * What the daily cap left for tomorrow (D-009). Stated and left there —
     * there is no control that overrides it and no copy that asks for one.
     */
    restTomorrow: string
    start: string
    /** The queue is finished. Calm, not congratulatory. */
    done: string
    /** Off the finished screen, to somewhere that is not this one. */
    toNotes: string
  }

  /**
   * Answering one card. Deliberately the same words in the due queue and in a
   * recall question inside a run: it is the same interaction, and a second
   * vocabulary for it would be a second thing to learn.
   */
  answering: {
    /** How far through. A position, never a score and never a target. */
    position: (current: number, total: number) => string
    /** Fetches the back. Nothing about the answer is on the page yet (D-003). */
    reveal: string
    /** While that request is in flight. */
    revealing: string
    /**
     * The two ratings, and both are ordinary. Forgetting is the case the whole
     * schedule is built around, so neither of these may carry blame or a
     * warning tone — the palette has no token that would let it (D-054).
     */
    notYet: string
    remembered: string
    /** A card you could not answer leads to where it can be fixed. */
    editCard: string
  }

  /** The saved practice sets, underneath the due queue. */
  sets: {
    title: string
    description: string
    create: string
    empty: {
      title: string
      description: string
    }
    /** Counts rows under the list. A noun, not a sentence. */
    noun: string
  }

  /**
   * The one-line summary of a set: on its row in the list, and again under its
   * own title. One namespace because they are the same sentence twice.
   */
  summary: {
    randomQuestions: (n: number) => string
    /** A set whose questions were pinned by hand. */
    fixedQuestions: string
    /** How the *set* asks, never what the card is (D-076). */
    choice: string
    recall: string
    /** How many finished sittings the set has. A count, not an achievement. */
    runCount: (n: number) => string
  }

  /** The form that creates one. */
  newSet: {
    titleLabel: string
    titlePlaceholder: string
    formatLegend: string
    /** The two formats, each with the sentence that says what it is. */
    recallOption: string
    choiceOption: string
    /**
     * Said plainly rather than buried: recognising an answer among four is
     * easier than recalling it, and someone picking this should know that is
     * what they picked (D-077).
     */
    choiceNote: string
    domainLegend: string
    domainHint: string
    categoryLegend: string
    categoryHint: string
    selectionLegend: string
    randomOption: string
    fixedOption: string
    countLabel: string
    /** Where the questions of a fixed set get pinned. */
    fixedHint: string
    save: string
    cancel: string
  }

  /** One set's own page. */
  set: {
    /** Back to the merged screen, which holds every set. */
    back: string
    start: string
    /**
     * An unfinished sitting is picked up, not replaced: the server returns the
     * same run with the same questions and the same options (D-050). So this
     * pair is a plain statement of where things stand, not a warning.
     */
    resume: string
    openRun: string
    archive: string
    delete: string
    /** Pins the questions of a fixed set. Prompts only, never the backs. */
    picker: {
      loading: string
      title: string
      /** Chosen out of what exists, not out of what is loaded (D-084). */
      chosen: (chosen: number, total: number) => string
      empty: string
      save: string
      noun: string
    }
    history: {
      title: string
      /** No sittings yet. A fact about the set, not about the reader. */
      empty: string
      noun: string
    }
  }

  /** One sitting of a set. */
  run: {
    /** Every question answered, before the run is closed. */
    finished: {
      title: string
      description: string
      action: string
    }
    position: (current: number, total: number) => string
    /** A card deleted after the draw still holds its place in the score. */
    missingCard: string
    skip: string
    /**
     * The verdict on one multiple-choice answer. Neither of these says
     * "wrong": the Indonesian avoids it deliberately and so does this.
     */
    correct: string
    incorrect: string
    next: string
    result: {
      title: string
      /**
       * A sitting is practice. It does not touch the schedule, and saying so
       * is what keeps practice from reading like a second review queue.
       */
      noScheduleChange: string
      /** The useful half of the result: what to look at again. */
      missedTitle: string
      back: string
    }
  }
}
