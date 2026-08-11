import { LogOut, Monitor } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Loading } from '../../components/ui/spinner'
import { Notice } from '../../components/ui/notice'
import {
  useAuthSessions,
  useRevokeAuthSession,
  useRevokeOtherAuthSessions,
  type AuthSession,
} from '../auth/useAuth'

/**
 * Where the account is signed in (07 L5).
 *
 * Server-side sessions (D-039) make this a query rather than a feature: the
 * rows already exist because revoking one has to actually revoke it, so the
 * screen is a listing of something the auth system needed anyway.
 *
 * Deliberately not punitive and not alarming (hard rule 6). A list of your own
 * devices is not a security warning, so there is no red, no "unrecognised
 * device" language, and no count badge — the sort of copy that makes someone
 * anxious about an ordinary second browser.
 */
export function ActiveSessions() {
  const { data: sessions, isPending, isError, error } = useAuthSessions()
  const revoke = useRevokeAuthSession()
  const revokeOthers = useRevokeOtherAuthSessions()

  if (isPending) {
    return (
      <Card className="flex items-center justify-center p-8">
        <Loading />
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="p-5">
        <Notice role="alert">{error.message}</Notice>
      </Card>
    )
  }

  const others = sessions.filter((s) => !s.current)

  return (
    <Card className="flex flex-col gap-1 p-5">
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          disabled={revoke.isPending || revokeOthers.isPending}
          onRevoke={() => revoke.mutate(session)}
        />
      ))}

      {revoke.isError && (
        <Notice role="alert" className="mt-2">
          {revoke.error.message}
        </Notice>
      )}

      {others.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-card-fg">Keluar dari perangkat lain</p>
            <p className="text-xs text-muted-fg">
              Sesi di perangkat ini tetap aktif.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate()}
          >
            <LogOut />
            {revokeOthers.isPending ? 'Sebentar…' : 'Keluarkan'}
          </Button>
        </div>
      )}
    </Card>
  )
}

function SessionRow({
  session,
  disabled,
  onRevoke,
}: {
  session: AuthSession
  disabled: boolean
  onRevoke: () => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <Monitor className="size-4 shrink-0 text-subtle-fg" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-card-fg">
          {describeClient(session.userAgent)}
          {session.current && (
            <span className="ml-2 text-xs font-normal text-muted-fg">
              (perangkat ini)
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-fg">
          {session.ip ?? 'alamat tidak diketahui'} · aktif {relativeTime(session.lastSeen)}
        </p>
      </div>

      {/*
        The current session gets a revoke button too. It is a logout, and
        labelling it honestly is better than hiding it and leaving someone to
        wonder why one row cannot be ended.
      */}
      <Button variant="ghost" size="sm" disabled={disabled} onClick={onRevoke}>
        {session.current ? 'Keluar' : 'Akhiri'}
      </Button>
    </div>
  )
}

/**
 * Turn a User-Agent into something a person recognises.
 *
 * A handful of substring checks, not a UA-parsing library: the question this
 * answers is "is one of these not me", and a browser and platform name is
 * enough for that. A parser would be a dependency plus a table that goes stale
 * (D-065), for a more precise answer to a question nobody is asking.
 */
function describeClient(userAgent?: string): string {
  if (!userAgent) return 'Perangkat tidak dikenal'

  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : null

  const platform =
    /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Linux/.test(userAgent) ? 'Linux'
    : null

  if (browser && platform) return `${browser} di ${platform}`
  if (browser) return browser
  if (platform) return platform
  // Something unrecognised — show it rather than calling it unknown, because
  // the raw string is still the most useful thing available.
  return userAgent.length > 40 ? `${userAgent.slice(0, 40)}…` : userAgent
}

/**
 * Coarse, and coarse on purpose: last_seen_at is only written every few
 * minutes, so anything more precise than this would be claiming accuracy the
 * value does not have.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'baru saja'

  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 10) return 'baru saja'
  if (minutes < 60) return `${minutes} menit lalu`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'kemarin'
  if (days < 30) return `${days} hari lalu`
  return 'lebih dari sebulan lalu'
}
