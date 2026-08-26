import { pluralFor } from './plural'
import type { Copy } from './types'

/**
 * English — translated from `id.ts`, which is the original.
 *
 * The same strings in the same order. Nothing added because an English sentence
 * felt like it wanted one more word, and nothing dropped because it read
 * awkwardly. If a line genuinely cannot be said this way in English, the fix is
 * to change the Indonesian first and translate the new version — not to let the
 * two catalogs say different things.
 *
 * ## Read this before you translate anything
 *
 * **Never punitive** (hard rule 6) survives translation only if somebody is
 * watching, and English is where it fails. English has a far larger vocabulary
 * of gentle blame than Indonesian does, and every phrase in it sounds friendly:
 *
 *   - No *don't forget*, *remember to*, *make sure you*.
 *   - No *you missed*, *you fell behind*, *you haven't*, *overdue*.
 *   - No *keep your streak*, *stay on track*, *don't break the chain*.
 *   - No *oops*, *uh oh*, *sorry!*, no exclamation marks.
 *   - No urgency: nothing *expires*, nothing is *running out*, nothing is
 *     *waiting for you*.
 *
 * A missed day is normal and the copy treats it as normal. The nearest thing to
 * a rule of thumb: state the fact, then the action. "Sisanya besok." is "The
 * rest tomorrow." — not "You still have 30 cards to go!".
 *
 * `catalog.test.ts` fails on the phrases above. It catches the ones that keep
 * reappearing, and it is not a substitute for reading this paragraph — there
 * are more ways to blame someone in English than a test can list.
 *
 * ## Style
 *
 * Plain, direct, active voice, sentence case, no filler. Sentence case means
 * buttons read "Sign out", not "Sign Out". Say *you*, never *the user*. Prefer
 * the short word: *use*, not *utilise*; *end*, not *terminate*.
 *
 * ## Screen names — decided, do not relitigate
 *
 * | Indonesian | English |
 * |---|---|
 * | Ulangan  | **Review**   |
 * | Latihan  | **Practice** |
 * | Terhapus | **Deleted**  |
 *
 * The operator's decision. These are product vocabulary rather than strings —
 * D-075 – D-077 record Ujian being folded into Ulangan and a table renamed
 * specifically to end an ambiguity — so they were chosen once, deliberately,
 * and they are not a per-screen call. Use them; do not reopen them.
 *
 * **Deleted, not Trash**, and the reasoning is worth keeping because it is the
 * rule this whole catalog is built on rather than a matter of taste. Terhapus
 * literally means deleted. `/privacy` already bolds **Terhapus** as the
 * recoverable state and reserves *benar-benar dihapus* for the permanent one,
 * so the pair is load-bearing in a document that has a coverage test over it.
 * "Trash" would import a discarded-and-gone metaphor the Indonesian never had —
 * and D-069 is thirty days and recoverable, which is the opposite claim. That
 * is a rewrite, not a translation, and rewriting is the one thing `en.ts` is
 * not allowed to do.
 *
 * **Review has a known cost, accepted rather than overlooked.** One English
 * word now covers the feature, the `/review` route and the `review_logs` /
 * `review_runs` / `review_sets` tables, so "review" in English prose is
 * ambiguous in a way "Ulangan" is not. That was weighed and taken. It is not a
 * discovery, and it is not grounds to revisit the name.
 *
 * A name not in this table is still undecided. If a screen you are converting
 * needs one, leave an explicitly marked placeholder and say so — a placeholder
 * that reads like a decision is worse than a gap.
 */

/** English distinguishes `one` from `other`. */
const n = pluralFor('en')

export const en: Copy = {
  common: {
    working: 'One moment…',
    today: 'Today',
    yesterday: 'Yesterday',
  },

  settings: {
    language: {
      title: 'Language',
      description: 'Stored on your account, so it follows you to other devices.',
      auto: 'Follow the browser',
    },

    sessions: {
      title: 'Signed-in devices',
      description: 'Where this account is in use. End any you do not recognise.',
      currentDevice: '(this device)',
      unknownDevice: 'Unknown device',
      unknownAddress: 'address unknown',
      clientOn: (browser, platform) => `${browser} on ${platform}`,
      lastActive: (relative) => `active ${relative}`,
      signOutCurrent: 'Sign out',
      // "End", not "Revoke": the Indonesian is the ordinary word for finishing
      // something, and revoke is the language of a security incident.
      endSession: 'End',
      signOutOthers: {
        title: 'Sign out of other devices',
        description: 'This device stays signed in.',
        // Indonesian distinguishes Keluar (leave) from Keluarkan (put out).
        // English has no one-word pair, so the object carries it.
        action: 'Sign them out',
      },
      ago: {
        justNow: 'just now',
        minutes: (count) => n(count, { one: '# minute ago', other: '# minutes ago' }),
        hours: (count) => n(count, { one: '# hour ago', other: '# hours ago' }),
        yesterday: 'yesterday',
        // `one` is unreachable — the caller answers "yesterday" at one day —
        // but a plural form that exists only in the cases the current caller
        // happens to produce is a bug waiting for the next caller.
        days: (count) => n(count, { one: '# day ago', other: '# days ago' }),
        overAMonth: 'over a month ago',
      },
    },
  },
}
