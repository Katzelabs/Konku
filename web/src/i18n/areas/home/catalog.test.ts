import { describe, expect, it } from 'vitest'
import { home as en } from './en'
import { home as id } from './id'

/**
 * The two counted strings on the home screen, and the one line that has to
 * survive translation without acquiring a standard to have missed.
 *
 * `i18n/catalog.test.ts` covers parity and the punitive vocabulary across both
 * whole catalogs. These are the claims specific to this area.
 */

describe('the due tile', () => {
  it('inflects the unit without carrying the number', () => {
    // The count is rendered three type sizes larger than its unit, so the two
    // cannot be one string. English still has to agree with it.
    expect(en.due.cardsUnit(0)).toBe('cards')
    expect(en.due.cardsUnit(1)).toBe('card')
    expect(en.due.cardsUnit(9)).toBe('cards')
    expect(id.due.cardsUnit(1)).toBe('kartu')
    expect(id.due.cardsUnit(9)).toBe('kartu')
  })

  it('states the cap rather than what is left to do', () => {
    // D-009: the cap is the feature, and the deferred cards are not a debt.
    // "The rest tomorrow.", never "30 still to go".
    expect(id.due.deferred).toBe('Sisanya besok.')
    expect(en.due.deferred).toBe('The rest tomorrow.')
    expect(en.due.deferred).not.toMatch(/still|left|remaining|to go|waiting/i)
  })

  it('says nothing is due without implying that is unusual', () => {
    for (const line of [id.due.none, en.due.none, id.due.allToday, en.due.allToday]) {
      expect(line).not.toMatch(/great|nice|well done|bagus|hebat/i)
    }
  })
})

describe('the weekly quota', () => {
  it('is a rate, not a progress reading', () => {
    expect(id.domains.weekly(3)).toBe('3×/minggu')
    expect(en.domains.weekly(3)).toBe('3×/week')
    expect(en.domains.weekly(1)).toBe('1×/week')
    // No "0 of 3", which is the progress bar D-009 refuses in sentence form.
    expect(en.domains.weekly(3)).not.toContain(' of ')
  })
})
