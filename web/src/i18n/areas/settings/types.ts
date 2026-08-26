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
   * The shell every settings screen renders inside (D-079).
   *
   * `navLabel` is the accessible name of the rail *and* of the phone strip —
   * one string, rendered twice, because they are two presentations of the same
   * nav. Two keys would be an invitation for them to drift, and a screen reader
   * announcing two differently-named navigations on one page is the bug.
   */
  shell: {
    title: string
    description: string
    /** `aria-label` on the rail and the phone strip. */
    navLabel: string
  }

  /**
   * The rail's destinations — `features/settings/nav.ts`.
   *
   * A label is copy, so `nav.ts` stops holding the words and takes them from
   * here. The routes, the icons and the grouping stay there: those are
   * structure, and structure does not translate.
   *
   * **Two of these name screens this directory does not own.** `domains` and
   * `categories` are rail entries rendered by the settings shell, so they are
   * settings copy — and one area may not reach into another's directory, which
   * is the whole point of the split. That the domains screen will also have a
   * heading of its own is not duplication: a rail label and a page heading are
   * separately-changeable copy, and `devices` and `data` below already differ
   * from the headings of the screens they open.
   */
  nav: {
    /** The three headings above the groups. Desktop rail only. */
    groups: {
      account: string
      labels: string
      app: string
    }
    profile: string
    devices: string
    domains: string
    categories: string
    preferences: string
    appearance: string
    data: string
    about: string
  }

  /** A read-only fact about the account, when the account has not got one. */
  field: {
    /**
     * Shown in place of a value that is blank. An account made before signup
     * asked for a name genuinely has none, and saying so is more honest than
     * repeating the address under a label that says Nama.
     */
    empty: string
  }

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

  /**
   * Dismissing a dialog without doing the thing.
   *
   * Area-level rather than repeated in the two dialogs that use it. A Batal
   * that half the app shares belongs in `common`, and `common` is the root
   * catalog, which this directory may not edit — so it sits here, once, and is
   * a candidate to move when somebody owns that file.
   */
  cancel: string

  /** Who is signed in, and how to stop being (AccountSettings). */
  account: {
    title: string
    description: string
    /** The state of the address, stated as a fact rather than as a warning. */
    emailVerified: string
    emailUnverified: string
    nameLabel: string
    emailLabel: string
    /**
     * Ending this device's session. A sign-out, and it says so — the same call
     * `sessions.signOutCurrent` makes, and for the same reason: hiding what a
     * red-outlined button does is worse than naming it.
     */
    signOut: {
      title: string
      description: string
      action: string
    }
  }

  /**
   * Changing the password without going via the mailbox (ChangePassword).
   *
   * **Not destructive.** No red, no "are you sure": tightening your own
   * security is the opposite of the irreversible act red is reserved for
   * (D-054), so the copy states what happens to the other devices rather than
   * warning about it.
   */
  password: {
    /** The row's title and the dialog's title. One string, deliberately. */
    title: string
    rowDescription: string
    action: string
    dialogDescription: string
    currentLabel: string
    newLabel: string
    /** `MIN_PASSWORD` from `features/auth/schemas`, counted. */
    newHint: (min: number) => string
    confirmLabel: string
    confirmPlaceholder: string
    saving: string
    save: string
  }

  /**
   * The theme (AppearanceSettings).
   *
   * On this screen rather than Preferensi because it is stored on the device
   * and does not travel — the line `nav.ts` draws between the two, which both
   * descriptions state outright.
   */
  appearance: {
    title: string
    description: string
    themeLabel: string
    themes: {
      light: string
      dark: string
      /** Named for what it does, like `language.auto` directly above. */
      system: string
    }
  }

  /** Preferences stored on the account (PreferencesSettings). */
  preferences: {
    title: string
    description: string
    focusDuration: {
      title: string
      description: string
      /** One option in the toggle group. Counted — English needs the plural. */
      minutes: (n: number) => string
    }
    loading: string
    /**
     * The settings request failed. States the fact and the one thing worth
     * trying; no apology and no alarm, because a failed GET is not the reader's
     * doing and is not their problem to feel bad about.
     */
    loadError: string
  }

  /** What this app does with what you give it (AboutSettings). */
  about: {
    title: string
    description: string
    /** What is stored, and the three things it is never used for. */
    stores: string
    /** Hard rule 11, said on a screen rather than only in a policy. */
    notAggregated: string
    /**
     * The two documents, linked rather than summarised: `/privacy` and
     * `/terms` have a coverage test over them (07 L9) and a summary that
     * drifted would be worse than none. The pages themselves are `legal`; these
     * two are the link labels this screen draws.
     */
    privacy: string
    terms: string
  }

  /**
   * Everything that leaves, in both senses (DataSettings): the archive you can
   * take with you (07 L6) and the account you can end (07 L7).
   */
  export: {
    title: string
    description: string
    /** What is in the archive, and in which format. */
    formats: string
    /** That it opens anywhere. Obsidian is a proper noun inside a sentence. */
    portable: string
    row: {
      title: string
      /** What is deliberately left out. Credentials never leave (07 L6). */
      description: string
    }
    /** On the anchor. Also on the copy offered inside the delete dialog. */
    action: string
  }

  /**
   * Deleting the account (07 L7).
   *
   * **This is the permanent one, and the copy must not read softer than it
   * is.** There is no tombstone and no thirty-day window here — D-069's window
   * is notes and cards, a different thing on different screens — so nothing in
   * this block may hint at recoverability. "Tidak bisa dikembalikan" is the
   * claim, and its translation carries the same weight or it is wrong.
   *
   * Direct about permanence, and it stops there. Hard rule 6 rules out
   * punitive tone here too: the honest thing is to say plainly that this cannot
   * be undone, not to make somebody feel bad for leaving. No "are you really
   * sure", no guilt, no list of what they will miss.
   */
  delete: {
    /** The section heading and the dialog's title. */
    title: string
    /** Under the heading. Points at the export before the panel does. */
    description: string
    /** On the button that opens the dialog. */
    action: string
    /** On the tinted panel, beside the warning icon. */
    rowTitle: string
    rowDescription: string
    dialogDescription: string
    /** The export, offered at the last moment it is still possible. */
    exportPrompt: string
    /** This is the one endpoint that re-authenticates (07 L7). */
    passwordLabel: string
    deleting: string
    /** The confirmation itself. Says whose account, because it is yours. */
    confirm: string
  }
}
