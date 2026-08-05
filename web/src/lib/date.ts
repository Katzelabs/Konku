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
