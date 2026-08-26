/**
 * Timer copy — ticket 11 I5.
 *
 * ONE AREA PER DIRECTORY, and this directory is owned by whoever is converting
 * `web/src/features/timer/`. Nothing outside it should be edited to add a
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
 * ## This area is mostly durations, and that is the interesting part
 *
 * Minutes appear in four places — the duration picker, the running summary,
 * the per-day total in the log and every row of it — and every one of them is
 * `minutes(n)` rather than a template. English distinguishes "1 minute" from
 * "2 minutes"; Indonesian does not, and `pluralFor` is what keeps `id.ts` from
 * carrying machinery for a distinction it does not make.
 *
 * The clock face itself is **not** here. `clock()` in `lib/date.ts` is m:ss and
 * carries no language; wall-clock times go through `useDateFormat().timeOfDay`,
 * which is `Intl` keyed on the active locale (D-094). Nothing in this file
 * formats a time, and nothing added to it should.
 */

export interface TimerCopy {
  title: string
  description: string

  /**
   * The word under the clock face, keyed by `TimerStatus` so the mapping is
   * the type rather than a `Record` in the screen. Rendered upper-case by CSS,
   * which is why these are written in sentence case like everything else.
   */
  status: {
    idle: string
    running: string
    paused: string
    done: string
  }

  /** The controls under the clock. Which of them is shown depends on status. */
  controls: {
    start: string
    pause: string
    /** Picks a paused session back up. Not "start" — nothing restarts. */
    resume: string
    /** Puts the clock back to the full duration. Ends nothing and logs nothing. */
    reset: string
  }

  /**
   * Duration and domain are each said twice — once as the label above a picker
   * before the session starts, once as a row label in the summary while it
   * runs — so they are one key rather than a `setup.` pair and a `summary.`
   * pair that could drift apart.
   */
  duration: string
  durationHint: string
  domain: string
  /** A session with no domain: the picker, the summary, and every log row. */
  noDomain: string

  /**
   * A length in minutes. The duration options, the summary row, the per-day
   * total in the log and each row of it.
   */
  minutes: (n: number) => string

  /** What the running session was set to, once the pickers are gone. */
  summary: {
    title: string
    /**
     * Row label for the wall-clock time the session ends at. Only while
     * running — a paused session has no end time, and the screen does not
     * invent one.
     */
    endsAround: string
  }

  /**
   * The write to `/sessions` did not land.
   *
   * A failed request, not a thing the reader did, and the copy says so: it
   * states what is true of the record and offers the retry. No apology, no
   * urgency, nothing about the session being lost — it is still on screen.
   */
  logFailed: string
  retry: string

  /**
   * The prompt at the end of a session (D-011, D-038).
   *
   * The highest-value strings in this area. It is a plain question with one
   * field, and skipping is an equal option — same weight as saving, no
   * greying out, nothing said about a session that produced no note. Anything
   * that makes this longer, warmer or more encouraging is working against the
   * thing it exists to do, which is cost nothing to answer.
   */
  capture: {
    title: string
    description: string
    /**
     * The same guidance as `description`, in the field itself. Two keys and
     * not one, because they are two places on the screen and a translator is
     * entitled to shorten the one that sits inside the box.
     */
    placeholder: string
    /** Runs into `cardSyntax` below, which is rendered as code. */
    cardHint: string
    /**
     * The example either side of `::`. The separator is what the parser reads;
     * the two words around it are placeholders and are therefore copy.
     */
    cardSyntax: string
    skip: string
    save: string
    /**
     * The save button while the note is in flight. Its own key rather than
     * `common.working`, which says "one moment" — this one names what is
     * happening, and the Indonesian said so first.
     */
    saving: string
  }

  /**
   * The session log (D-084, D-087).
   *
   * A log and only a log — no streak, no weekly target, no comparison with
   * last week. The per-day total is a sum and is compared with nothing.
   */
  log: {
    title: string
    /** How many sessions exist, beside the title. Not how many are shown. */
    sessions: (n: number) => string
    empty: {
      title: string
      description: string
    }
    /**
     * What is on screen versus what exists, when the window is smaller than
     * the log.
     *
     * **This states a limit; it does not apologise for one.** There is no
     * "load more" under it and nothing is being withheld — browsing back
     * through months of sessions is the Activity log (PRD §5.10) and that is
     * deferred. A translation that turns it into "only showing…" has changed
     * what it means.
     */
    showing: (shown: number, total: number) => string
  }
}
