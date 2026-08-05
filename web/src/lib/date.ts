/**
 * Local calendar dates as YYYY-MM-DD, never UTC timestamps.
 *
 * A session at 23:00 belongs to that day, not the next one. Using
 * toISOString() here would shift the date for anyone east of UTC after their
 * afternoon — a bug that shows up for some users, some of the time, which is
 * the worst kind.
 */
export function today(now: Date = new Date()): string {
  return format(now)
}

export function format(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/**
 * A timestamp as a short day label. Compared by local calendar date, so an
 * 11pm note still reads "Hari ini" rather than jumping to yesterday.
 */
export function humanDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const day = format(d)
  if (day === format(now)) return 'Hari ini'

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === format(yesterday)) return 'Kemarin'

  const sameYear = d.getFullYear() === now.getFullYear()
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return sameYear ? base : `${base} ${d.getFullYear()}`
}

/** Minutes and seconds for the timer face. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
