/**
 * Local calendar dates as YYYY-MM-DD, never UTC timestamps.
 *
 * A session at 23:00 belongs to that day, not the next one. Using
 * toISOString() here would shift the date for anyone east of UTC after their
 * afternoon — a bug that shows up for some users, some of the time, which is
 * the worst kind.
 *
 * ## Two halves, and the split is deliberate
 *
 * `today`, `format` and `clock` carry no language and are plain functions.
 * Everything a person *reads* — a month name, a clock separator, a digit
 * group — goes through `Intl` keyed on the active locale (D-094), and lives in
 * `dateFormatters` below, which a screen reaches through `useDateFormat()`.
 *
 * `Intl` is doing real work here rather than being ceremony. Indonesian writes
 * `9 Agu` and 24-hour times as `14.30`; English writes `9 Aug` and `14:30`.
 * Both of those used to be hardcoded — a hand-written month table and a
 * literal `.` — and neither would have been noticed as a bug in an English
 * build, because both are legible and merely wrong.
 *
 * **This has nothing to do with `internal/store/date.go`.** That file is the
 * storage boundary and works in UTC; this one is display. The rule that
 * forbids `In()`/`Local()`/`UTC()` on a stored date is about the former.
 */
import type { Copy, Locale } from '../i18n'

export function today(now: Date = new Date()): string {
  return format(now)
}

export function format(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Minutes and seconds for the timer face. Not a wall-clock time — no locale. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** The two relative-day labels, taken from the catalog rather than written here. */
export interface RelativeDays {
  today: string
  yesterday: string
}

/** Everything a screen renders a date with, bound to one locale. */
export interface DateFormatters {
  /** A timestamp as a short day label. */
  humanDay: (iso: string, now?: Date) => string
  /** The same label for a stored local date (`YYYY-MM-DD`). */
  humanDate: (ymd: string, now?: Date) => string
  /** A timestamp as a local 24-hour clock time, for the session log. */
  timeOfDay: (iso: string) => string
}

/**
 * Build the formatters for a locale.
 *
 * Exported for tests and for `useDateFormat`; screens use the hook. The `Intl`
 * objects are constructed once per call rather than once per format, because
 * they are not free to construct and a list re-renders these on every row.
 */
export function dateFormatters(locale: Locale, relative: RelativeDays): DateFormatters {
  // `day: 'numeric'` and not '2-digit': "9 Agu", never "09 Agu". The year is a
  // separate formatter because it is only shown for a date outside this one.
  const shortDay = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const withYear = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  // hourCycle rather than hour12: `hour12: false` is specified to produce h24
  // in some engines, which renders midnight as 24 rather than 00.
  const wallClock = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  function dayLabel(d: Date, now: Date): string {
    const day = format(d)
    if (day === format(now)) return relative.today

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (day === format(yesterday)) return relative.yesterday

    const sameYear = d.getFullYear() === now.getFullYear()
    return (sameYear ? shortDay : withYear).format(d)
  }

  return {
    // Compared by local calendar date, so an 11pm note still reads "Hari ini"
    // rather than jumping to yesterday.
    humanDay(iso, now = new Date()) {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      return dayLabel(d, now)
    },

    // The parts are read by hand because `new Date('2026-08-08')` is specified
    // as UTC midnight — west of UTC that renders every session one day early,
    // which is exactly the bug the stored-local-date design exists to avoid.
    humanDate(ymd, now = new Date()) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
      if (!m) return ''
      return dayLabel(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), now)
    },

    timeOfDay(iso) {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      return wallClock.format(d)
    },
  }
}

/** The relative-day labels a `Copy` carries. One place, so a rename is one edit. */
export function relativeDays(copy: Copy): RelativeDays {
  return { today: copy.common.today, yesterday: copy.common.yesterday }
}
