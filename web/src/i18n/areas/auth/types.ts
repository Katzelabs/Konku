/**
 * Auth copy — ticket 11 I5.
 *
 * ONE AREA PER DIRECTORY, and this directory is owned by whoever is converting
 * `web/src/features/auth/`. Nothing outside it should be edited to add a
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
 * ## What is NOT in here, and must not be added
 *
 * **Anything the server says.** A failed login, a spent token, a rate limit and
 * a quota all arrive as `error.message` already in the reader's language (11
 * I3, `internal/i18n`), and every screen in this feature renders that string
 * verbatim. Copying one of those sentences in here would give it two homes and
 * one of them would drift — and the one that drifts is the one nobody reads,
 * because the server's is the one that ships.
 *
 * What *is* in here is the client's own half: the zod messages the forms show
 * before a round trip (D-070). Those are duplicated against the Go handlers on
 * purpose and that duplication is documented in `features/auth/schemas.ts`;
 * this file is where the Indonesian and English of it lives.
 *
 * ## The tone these five screens need
 *
 * They are the first thing a stranger sees and the place someone lands when
 * they cannot get in. Nobody arriving here is having a good minute. So: plain,
 * direct, active voice, sentence case, no filler, no exclamation marks, and
 * nothing that implies the reader did something wrong — a mistyped password
 * and an expired link are ordinary events and the copy treats them as such.
 */

export interface AuthCopy {
  /**
   * The two links under every signed-out screen (07 L9).
   *
   * The documents themselves are the `legal` area, which is a different owner
   * and a much larger file. These are only the labels on the links.
   */
  legal: {
    privacy: string
    terms: string
  }

  /**
   * The example address, shown as a placeholder on every screen that asks for
   * one. Localised because "nama" is an Indonesian word, not because the shape
   * of an address changes.
   */
  emailPlaceholder: string

  /**
   * The password rule and the confirm field, shared by the three forms that
   * set a password: signup, reset, and change-password on the settings screen.
   *
   * Shared inside this area rather than restated three times, because the rule
   * is one rule — the moment it is three strings it starts saying three
   * slightly different things, which is the drift `schemas.ts` warns about
   * between the client and the server.
   */
  password: {
    /**
     * Stated under the field before submitting, not as an error afterwards. A
     * rule you only learn by breaking it is a rule that annoys.
     */
    hint: (min: number) => string
    /** On the confirm input of every form that has one. */
    confirmPlaceholder: string
  }

  login: {
    subtitle: string
    email: string
    password: string
    submit: string
    /** On the button while the request is in flight. */
    submitting: string
    forgot: string
    /** Only rendered where `ALLOW_SIGNUP` is on. */
    noAccount: string
    createAccount: string
  }

  signup: {
    title: string
    subtitle: string
    firstName: string
    /**
     * An example of a *single* given name, not a full name and not a
     * restatement of the label — it teaches the shape the form is asking for.
     */
    firstNamePlaceholder: string
    lastName: string
    /**
     * Says the field may be left empty. Carried by the placeholder because the
     * other four inputs are `required` and this one is not, which is what
     * makes its silence mean something to a screen reader.
     */
    lastNamePlaceholder: string
    email: string
    password: string
    confirmPassword: string
    submit: string
    submitting: string
    haveAccount: string
    signIn: string
  }

  /**
   * "A verification link is in your mailbox."
   *
   * Shared by the signup success state and the signed-in-but-unverified
   * screen, which are the same sentence to the same person a moment apart.
   *
   * `/auth/resend-verification` answers 204 for an unknown address, an
   * already-verified one and a genuine resend alike (D-039), so nothing here
   * may claim a message went out. `resent` says *if the account still needs
   * one*, and it has to keep saying that in both languages.
   */
  checkMail: {
    title: string
    subtitle: string
    /** `*…*` marks the address, which the screen renders emphasised. */
    sentTo: (email: string) => string
    expiry: string
    /** After a resend. Conditional on purpose — see above. */
    resent: string
    resend: string
    resending: string
    /** The wait, in the button's own label, so a disabled control says why. */
    resendIn: (seconds: number) => string
    /** The same wait for a screen reader, as a sentence. */
    resendWaitAnnounce: (seconds: number) => string
    resendReadyAnnounce: string
    /** The way out when the reader is signed in: signing out. */
    signOut: string
    /** The way out when they are not: back to the form. */
    backToLogin: string
  }

  forgot: {
    title: string
    subtitle: string
    email: string
    /**
     * The failure this screen actually produces is a link sent to a second
     * address the reader also owns, which answers 204 like everything else. So
     * the hint is the point of the field rather than decoration.
     */
    emailHint: string
    submit: string
    submitting: string
    rememberedIt: string
    signIn: string
    /**
     * The endpoint answers 204 whether or not the address has an account, so
     * this may not say a message was sent to it — only that one is on its way
     * *if* it is registered (D-039, D-066).
     */
    sent: {
      title: string
      /** `*…*` marks the address. */
      body: (email: string) => string
      expiry: string
      backToLogin: string
    }
  }

  reset: {
    title: string
    password: string
    confirmPassword: string
    submit: string
    submitting: string
    /** Every session is gone by now, including this browser's. Say so. */
    done: {
      title: string
      body: string
      signIn: string
    }
    /**
     * Expired, spent and never-valid read the same, because they read the same
     * from the server: telling them apart tells an attacker which guesses were
     * close. `incompleteLink` is the one case the client detects on its own —
     * a URL with no token at all.
     */
    failed: {
      title: string
      incompleteLink: string
      requestNew: string
    }
  }

  verify: {
    /** The title while the token is being spent. */
    pending: string
    /**
     * Beside the spinner under that title.
     *
     * `components/ui/spinner.tsx` defaults this to an Indonesian string of its
     * own, and `components/ui/` is out of scope for this conversion — so the
     * screen passes the label rather than taking the default, and the half a
     * reader sees on an English account is correct. When the shared components
     * are converted this key goes away and the default comes back.
     */
    loading: string
    done: {
      title: string
      subtitle: string
      body: string
      signIn: string
    }
    /** Same three-cases-one-answer shape as `reset.failed`. */
    failed: {
      title: string
      incompleteLink: string
      /** How to get another one from here. */
      help: string
      signIn: string
    }
  }

  /**
   * What the signed-out forms say before a round trip (D-070).
   *
   * These are **not** a security boundary — `internal/api` enforces every one
   * of them again — and they are duplicated against the handlers on purpose,
   * in the same words. Where the two differ the server is right.
   */
  validation: {
    emailRequired: string
    emailFormat: string
    passwordRequired: string
    passwordMin: (min: number) => string
    nameMax: (max: number) => string
    nameControlChars: string
    firstNameRequired: string
    confirmRequired: string
    confirmMismatch: string
    currentPasswordRequired: string
    /** Refused rather than accepted as a no-op. The server refuses it too. */
    passwordUnchanged: string
  }
}
