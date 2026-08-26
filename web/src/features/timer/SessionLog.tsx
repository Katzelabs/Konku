import { DomainDot } from '../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { Notice } from '../../components/ui/notice'
import { Loading } from '../../components/ui/spinner'
import { useDateFormat } from '../../lib/useDateFormat'
import type { FocusSession } from '../../api/types'
import { useAllDomains } from '../domains/queries'
import { useSessions } from './queries'

/**
 * The recent sessions, grouped by the day they belong to.
 *
 * A log, and deliberately only a log. No streak, no weekly target, no chart
 * trending toward a goal, no "you did less than last week" — every one of
 * those is the mechanic GOALS.md and D-054 rule out, and a history panel is
 * exactly where they creep back in. What it shows is what happened: which day,
 * what time, how long, which domain.
 *
 * The per-day total is a sum, not a score. It is compared with nothing.
 *
 * What it shows is a window over the log, not the whole of it, and it says so
 * (D-084). A panel that renders thirty rows reads identically whether the
 * account holds thirty sessions or three hundred, and stating the smaller
 * number as if it were the collection is the misinforming half of that bug.
 * Browsing back past the window is the Activity log (PRD §5.10) and is still
 * deferred — which is why this states the count and offers no "load more".
 */
export function SessionLog() {
  const d = useDateFormat()
  const { sessions, total, truncated, isPending, error } = useSessions()
  // The display path needs archived domains too — a session keeps its tag when
  // the domain is archived, and the record is the point (D-051).
  const { data: domains } = useAllDomains()

  const days = groupByDay(sessions ?? [])
  const shown = sessions?.length ?? 0

  return (
    <Card>
      {/* flex-row explicitly: CardHeader is a column by default, and
          tailwind-merge only drops a class that a later one contradicts. */}
      <CardHeader className="flex-row items-baseline justify-between gap-3">
        <CardTitle>Sesi terakhir</CardTitle>
        {total > 0 && (
          <span className="text-xs text-subtle-fg tabular-nums">
            {total} sesi
          </span>
        )}
      </CardHeader>

      {isPending && (
        <CardContent>
          <Loading />
        </CardContent>
      )}

      {error && (
        <CardContent>
          <Notice>{error.message}</Notice>
        </CardContent>
      )}

      {sessions && days.length === 0 && (
        <CardContent>
          <EmptyState
            title="Belum ada sesi tercatat."
            description="Sesi yang selesai muncul di sini."
          />
        </CardContent>
      )}

      {days.length > 0 && (
        <div className="border-t border-border">
          {days.map((day) => (
            <section key={day.date}>
              <header className="flex items-baseline justify-between gap-3 bg-muted px-5 py-1.5">
                <h4 className="text-xs font-medium text-muted-fg">
                  {d.humanDate(day.date)}
                </h4>
                <span className="text-xs text-subtle-fg tabular-nums">
                  {day.totalMinutes} menit
                </span>
              </header>

              <ul className="divide-y divide-border">
                {day.sessions.map((s) => {
                  const domain = domains?.find((d) => d.id === s.domainId)
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 px-5 py-2.5 text-sm"
                    >
                      <span className="w-11 shrink-0 text-xs text-subtle-fg tabular-nums">
                        {d.timeOfDay(s.completedAt)}
                      </span>
                      {domain ? (
                        <>
                          <DomainDot color={domain.color} />
                          <span className="min-w-0 flex-1 truncate text-card-fg">
                            {domain.label}
                          </span>
                        </>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-muted-fg">
                          Tanpa domain
                        </span>
                      )}
                      <span className="shrink-0 text-xs text-subtle-fg tabular-nums">
                        {s.durationMinutes} menit
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {/*
            Said plainly rather than implied by a list that simply stops. It is
            a statement of what is on screen, not a prompt to do anything —
            there is nothing to load and nothing being withheld as a nudge.
          */}
          {truncated && (
            <p className="border-t border-border px-5 py-2.5 text-xs text-subtle-fg">
              Menampilkan {shown} sesi terakhir dari {total}.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

interface Day {
  date: string
  totalMinutes: number
  sessions: FocusSession[]
}

/**
 * Groups on `sessionDate` — the local day the client sent — rather than on
 * `completedAt`. They disagree for exactly the session the whole date design
 * is about: one finished at 23.50 belongs to that day, and re-deriving the
 * group from the timestamp here would quietly undo that.
 *
 * The server already returns newest-first, so insertion order is the display
 * order and nothing needs sorting.
 */
function groupByDay(sessions: FocusSession[]): Day[] {
  const days: Day[] = []
  for (const s of sessions) {
    const last = days[days.length - 1]
    if (last?.date === s.sessionDate) {
      last.sessions.push(s)
      last.totalMinutes += s.durationMinutes
    } else {
      days.push({ date: s.sessionDate, totalMinutes: s.durationMinutes, sessions: [s] })
    }
  }
  return days
}
