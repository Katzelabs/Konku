/**
 * Settings copy — ticket 11 I5.
 *
 * ONE AREA PER DIRECTORY, and this directory is owned by whoever is converting
 * `web/src/features/settings/`. Nothing outside it should be edited to add a
 * string here: that is the whole reason the catalog is split this way, so six
 * people can convert six features at once without meeting in one file.
 *
 * The language control (I2) and the sessions screen (I1's worked example) were
 * already here and are the shape to copy.
 *
 * The rules, restated because this is where they get broken:
 *
 *   - The path is the id. Name a leaf for what it *is* on the screen, never
 *     for what it says.
 *   - A string with a value in it is a function, so its arity is typechecked.
 *   - A list is a tuple, so a translation that drops one fails the build.
 *   - `en` is *translated from* `id`. Same claims, same order.
 *   - Never punitive (hard rule 6); `catalog.test.ts` fails on the vocabulary.
 */

export interface SettingsCopy {
  /**
   * Choosing a language (00014, ticket 11 I2).
   *
   * On Preferensi rather than Tampilan, because it is stored on the account
   * and travels — which is the line `nav.ts` draws between those two
   * screens, and which the Tampilan screen states in its own description.
   *
   * The language *names* are deliberately not keys. A picker lists every
   * language in its own language, so "Bahasa Indonesia" and "English" read
   * the same in both catalogs and belong in the component that renders them
   * — the same rule that keeps browser and platform names out of here.
   */
  language: {
    title: string
    description: string
    /**
     * The option that stores nothing and follows the browser. Named for what
     * it does, because "Indonesian" would be a lie on an English browser.
     */
    auto: string
  }

  /**
   * Where the account is signed in (07 L5).
   *
   * Deliberately not punitive and not alarming (hard rule 6). A list of your
   * own devices is not a security warning, so there is no "unrecognised
   * device" language here and no urgency — the sort of copy that makes an
   * ordinary second browser frightening. `ActiveSessions.test.tsx` asserts
   * the Indonesian half of that and `catalog.test.ts` the English.
   */
  sessions: {
    title: string
    description: string
    /** Marks the row you are reading this on. Includes its own parentheses. */
    currentDevice: string
    /** No User-Agent at all. */
    unknownDevice: string
    /** No IP recorded. Lower case: it sits mid-line after a separator. */
    unknownAddress: string
    /** `describeClient` output when both halves are known. */
    clientOn: (browser: string, platform: string) => string
    /** Takes the already-formatted output of `ago` below. */
    lastActive: (relative: string) => string
    /** Ends the session you are using. It is a sign-out, and says so. */
    signOutCurrent: string
    /** Ends one of the others. */
    endSession: string
    signOutOthers: {
      title: string
      description: string
      action: string
    }
    /**
     * Coarse on purpose: `last_seen_at` is only written every few minutes, so
     * anything more precise would claim accuracy the value does not have.
     */
    ago: {
      justNow: string
      minutes: (n: number) => string
      hours: (n: number) => string
      yesterday: string
      days: (n: number) => string
      overAMonth: string
    }
  }
}
