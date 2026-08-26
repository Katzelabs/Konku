import { describe, expect, it } from 'vitest'
import { clock, dateFormatters, format, today } from './date'

// The Indonesian catalog's labels, passed in rather than imported from `id.ts`
// so that a test failure names the formatter rather than the copy.
const ID = dateFormatters('id', { today: 'Hari ini', yesterday: 'Kemarin' })
const EN = dateFormatters('en', { today: 'Today', yesterday: 'Yesterday' })

// Dates are the thing most likely to be quietly wrong for some users, some of
// the time — the worst kind of bug, and the reason hard rule 5 exists.

describe('local calendar dates', () => {
  // The case the whole design exists for. An 11pm session belongs to that day,
  // and toISOString() would move it to the next one for anyone east of UTC.
  it('an 11pm instant belongs to that day, not the next', () => {
    const lateEvening = new Date(2026, 7, 9, 23, 30, 0)
    expect(today(lateEvening)).toBe('2026-08-09')
  })

  it('a few minutes past midnight belongs to the new day', () => {
    expect(today(new Date(2026, 7, 10, 0, 5, 0))).toBe('2026-08-10')
  })

  // The specific failure toISOString() produces, made deterministic by
  // pinning the timezone in vitest.config.ts. Without that pin this assertion
  // is vacuous on a UTC runner, which is exactly where CI runs it.
  it('disagrees with toISOString for a late-evening instant', () => {
    const lateEvening = new Date(2026, 7, 9, 23, 30, 0)

    expect(new Date().getTimezoneOffset()).toBeGreaterThan(0) // west of UTC
    // UTC has already rolled over; the local calendar day has not.
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-08-10')
    expect(today(lateEvening)).toBe('2026-08-09')
  })

  it('pads single-digit months and days', () => {
    expect(format(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(format(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('humanDate', () => {
  const now = new Date(2026, 7, 9, 10, 0, 0)

  it('reads a stored YYYY-MM-DD by its parts, not through Date parsing', () => {
    // new Date('2026-08-09') is specified as UTC midnight, which renders as
    // the 8th west of UTC. Reading the parts by hand is what avoids that.
    expect(ID.humanDate('2026-08-09', now)).toBe('Hari ini')
    expect(ID.humanDate('2026-08-08', now)).toBe('Kemarin')
  })

  it('drops the year within the current year and keeps it otherwise', () => {
    expect(ID.humanDate('2026-03-02', now)).toBe('2 Mar')
    expect(ID.humanDate('2025-03-02', now)).toBe('2 Mar 2025')
  })

  it('returns empty for a malformed date rather than throwing', () => {
    expect(ID.humanDate('', now)).toBe('')
    expect(ID.humanDate('not-a-date', now)).toBe('')
    expect(ID.humanDate('2026-8-9', now)).toBe('')
  })
})

describe('humanDay', () => {
  const now = new Date(2026, 7, 9, 10, 0, 0)

  it('labels a late-evening timestamp as today, not yesterday', () => {
    const lastNight = new Date(2026, 7, 9, 23, 15, 0).toISOString()
    expect(ID.humanDay(lastNight, now)).toBe('Hari ini')
  })

  it('returns empty for an unparseable timestamp', () => {
    expect(ID.humanDay('rubbish', now)).toBe('')
  })
})

describe('timeOfDay', () => {
  it('formats as a local 24-hour clock', () => {
    expect(ID.timeOfDay(new Date(2026, 7, 9, 9, 5).toISOString())).toBe('09.05')
    expect(ID.timeOfDay(new Date(2026, 7, 9, 23, 59).toISOString())).toBe('23.59')
  })

  it('returns empty for an unparseable timestamp', () => {
    expect(ID.timeOfDay('nope')).toBe('')
  })

  it('keeps midnight as 00, not 24', () => {
    // `hour12: false` is specified to produce h24 in some engines, which
    // renders midnight as "24.00". hourCycle: 'h23' is what avoids it.
    expect(ID.timeOfDay(new Date(2026, 7, 9, 0, 0).toISOString())).toBe('00.00')
  })
})

// The reason this went through `Intl` rather than staying hand-written
// (D-094). Every assertion below used to be a hardcoded literal that was
// correct in Indonesian and merely legible — not obviously broken — in
// English, which is the kind of wrongness nobody reports.
describe('the same date in English', () => {
  const now = new Date(2026, 7, 9, 10, 0, 0)

  it('uses English month names', () => {
    // 'Agu' in Indonesian, from a hand-written table that had no English half.
    expect(ID.humanDate('2026-08-02', now)).toBe('2 Agu')
    expect(EN.humanDate('2026-08-02', now)).toContain('Aug')
  })

  it('separates the clock with a colon rather than a dot', () => {
    // Indonesian writes 14.30 and English writes 14:30. The separator was a
    // literal '.' before this.
    expect(ID.timeOfDay(new Date(2026, 7, 9, 14, 30).toISOString())).toBe('14.30')
    expect(EN.timeOfDay(new Date(2026, 7, 9, 14, 30).toISOString())).toBe('14:30')
  })

  it('takes the relative labels from the catalog it was given', () => {
    expect(EN.humanDate('2026-08-09', now)).toBe('Today')
    expect(EN.humanDate('2026-08-08', now)).toBe('Yesterday')
  })
})

describe('clock', () => {
  it('formats minutes and seconds for the timer face', () => {
    expect(clock(20 * 60_000)).toBe('20:00')
    expect(clock(65_000)).toBe('1:05')
    expect(clock(0)).toBe('0:00')
  })

  // Rounds up, so the face never shows 0:00 while time remains — a timer that
  // reads zero and keeps going is the kind of small wrongness that erodes
  // trust in the one number the user is watching.
  it('rounds up so a fraction of a second still reads as a second', () => {
    expect(clock(1)).toBe('0:01')
    expect(clock(59_001)).toBe('1:00')
  })

  it('never goes negative', () => {
    expect(clock(-5000)).toBe('0:00')
  })
})
