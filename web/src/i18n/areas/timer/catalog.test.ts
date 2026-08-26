import { describe, expect, it } from 'vitest'
import { timer as en } from './en'
import { timer as id } from './id'

/**
 * The counted strings in the timer area.
 *
 * `i18n/catalog.test.ts` already walks both catalogs for parity, blank strings
 * and an unreplaced `#`, and it probes every function with 1, 2 and 0. What it
 * cannot check is whether a sentence still *says* the right thing, and this
 * area has two that are easy to break silently:
 *
 *   - `log.showing` carries **two** numbers, and `pluralFor` replaces every `#`
 *     with the one count it was given. The total therefore has to be formatted
 *     before it goes into the form string. Get that backwards and the sentence
 *     reads "Showing the last 30 sessions of 30."
 *   - `minutes` is the whole duration vocabulary — the picker, the summary and
 *     every row of the log — and English inflects where Indonesian does not.
 */

describe('durations', () => {
  it('inflects in English and not in Indonesian', () => {
    expect(en.minutes(1)).toBe('1 minute')
    expect(en.minutes(25)).toBe('25 minutes')
    expect(id.minutes(1)).toBe('1 menit')
    expect(id.minutes(25)).toBe('25 menit')
  })
})

describe('the session log window', () => {
  it('states both numbers, and states them differently', () => {
    // D-087's example, verbatim: the panel that says what is on screen and
    // offers nothing to press.
    expect(id.log.showing(30, 312)).toBe('Menampilkan 30 sesi terakhir dari 312.')
    expect(en.log.showing(30, 312)).toBe('Showing the last 30 sessions of 312.')
  })

  it('does not print the shown count in place of the total', () => {
    // The failure mode `pluralFor`'s replaceAll invites. Both numbers appear,
    // and they are not the same number.
    expect(en.log.showing(1, 312)).toBe('Showing the last 1 session of 312.')
    expect(id.log.showing(1, 312)).toBe('Menampilkan 1 sesi terakhir dari 312.')
  })

  it('groups digits for the locale', () => {
    // The focus log has no ceiling, and Indonesian writes 5.000 where English
    // writes 5,000. A raw `${total}` prints 5000 in both and is wrong in both.
    expect(id.log.showing(30, 5000)).toContain('5.000')
    expect(en.log.showing(30, 5000)).toContain('5,000')
  })

  it('counts the collection beside the title', () => {
    expect(id.log.sessions(312)).toBe('312 sesi')
    expect(en.log.sessions(312)).toBe('312 sessions')
    expect(en.log.sessions(1)).toBe('1 session')
  })
})
