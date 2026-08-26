/**
 * The two legal documents, as data (ticket 11, I4).
 *
 * ## Why these are not in `Copy`
 *
 * `i18n/types.ts` holds the copy every screen reads through `useCopy()`, and
 * `id.ts` — the source language and the fallback — is *statically* imported so
 * that the fallback is never a network request. That is the right trade for
 * strings a screen needs the moment it paints. It is the wrong trade for these
 * two: `/privacy` and `/terms` are several kilobytes of prose per language,
 * they live at two URLs nobody visits before signing in, and the chunk they
 * would land in is the one a signed-out stranger waits on and
 * `npm run check:bundle` gates at 140 kB — with I5 still to land 551 more
 * literals in it.
 *
 * So the legal copy is its own catalog, and **both** locales are behind
 * `import()` (see `./index.ts`). The asymmetry that makes `id` static up in
 * `i18n/` exists because the *application* must render something when a chunk
 * does not arrive. A document that exists at exactly two URLs has no such
 * obligation: if its chunk fails, the reader gets the error boundary, and
 * there is nothing to fall back to that would not be worse than saying so.
 *
 * ## Why the documents are data rather than JSX
 *
 * L9 wrote both pages as JSX with the Indonesian inline. Translating that means
 * either duplicating the markup per language or threading a hundred leaf keys
 * through it, and both make it easy for the two languages to end up with
 * different *sections* — which, in a legal document, is two different policies
 * rather than an untidy page. As data, the section list is a mapped type over
 * one shared tuple: a language missing a section does not compile, and neither
 * language can reorder them, because the order lives in `PRIVACY_SECTIONS` /
 * `TERMS_SECTIONS` below and is read once by the renderer.
 *
 * `legal.test.tsx` is the second mechanism (hard rule 9), and it is the one
 * that checks the documents actually *say* the things the schema stores.
 */

/**
 * A run of text with two markers, and deliberately not markdown.
 *
 *   - `*bolded*` — one level, no nesting.
 *   - `[label](/terms)` — an in-app path, a `mailto:` or an `https://` URL.
 *
 * Rendered by `features/legal/inline.tsx` into React elements. Never
 * `innerHTML`, which is the property D-018 is about and which does not stop
 * mattering because the text came from our own catalog rather than from a note.
 *
 * react-markdown is already a dependency and was considered. It would pull the
 * whole markdown pipeline into the chunk a stranger downloads to read a privacy
 * policy, in order to render two kinds of span. Anything that is not one of the
 * two markers renders as itself.
 */
export type Inline = string

export type Block =
  | { readonly kind: 'p'; readonly text: Inline }
  | { readonly kind: 'ul'; readonly items: readonly Inline[] }

export interface Section {
  readonly heading: string
  readonly blocks: readonly Block[]
}

/**
 * The privacy policy's sections, in the order they are rendered.
 *
 * Shared by both languages rather than declared in each: an order a translation
 * can change is an order a translation *will* change, and "the same document in
 * two languages" stops being true the first time it happens.
 *
 * Each id is also a target for `coverage.ts`, which says — per database column —
 * which section is supposed to account for it.
 */
export const PRIVACY_SECTIONS = [
  'stored',
  'notStored',
  'processors',
  'browser',
  'retention',
  'suspension',
  'rights',
  'incidents',
  'changes',
] as const

export type PrivacySection = (typeof PRIVACY_SECTIONS)[number]

/** The terms' sections, same rule. `free` is D-096 and is not optional. */
export const TERMS_SECTIONS = [
  'free',
  'account',
  'yourContent',
  'notAllowed',
  'availability',
  'closing',
  'liability',
  'changes',
] as const

export type TermsSection = (typeof TERMS_SECTIONS)[number]

/**
 * One document.
 *
 * `sections` is a mapped type over the tuple above, so a missing section is a
 * compile error in the language that dropped it and an extra one is a compile
 * error in the language that invented it.
 */
export interface LegalDocument<S extends string> {
  readonly title: string
  /** The date the document last changed, written for the locale. */
  readonly updated: string
  /** Above the first heading. The summary a reader in a hurry stops at. */
  readonly intro: readonly Block[]
  readonly sections: { readonly [K in S]: Section }
  /** Below the last section. The cross-link to the other document. */
  readonly outro: readonly Block[]
}

export interface LegalCopy {
  /** The frame both documents share (`features/legal/LegalPage.tsx`). */
  frame: {
    /** The link out of the document, back to the app. */
    back: string
    /** Precedes the date. Carries its own separator. */
    updatedPrefix: (date: string) => string
    /** The closing line, above the contact address. */
    contact: string
  }
  privacy: LegalDocument<PrivacySection>
  terms: LegalDocument<TermsSection>
}

/** The address both documents close on, and the one the app points at. */
export const CONTACT_EMAIL = 'konku@katzeapps.com'

/**
 * Where the self-hosting guide lives.
 *
 * D-096 makes self-hosting the pressure valve behind "free forever", and a
 * pressure valve nobody can find is a claim rather than a valve. The repository
 * is public and `docs/SELF-HOSTING.md` is on `main`, so this link resolves —
 * which is the difference between the terms asserting the escape hatch and the
 * terms pointing at it.
 */
export const SELF_HOSTING_URL =
  'https://github.com/Katzelabs/Konku/blob/main/docs/SELF-HOSTING.md'
