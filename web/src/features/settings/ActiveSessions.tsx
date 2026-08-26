import { LogOut, Monitor } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Loading } from '../../components/ui/spinner'
import { Notice } from '../../components/ui/notice'
import { useCopy, type Copy } from '../../i18n'
import {
  useAuthSessions,
  useRevokeAuthSession,
  useRevokeOtherAuthSessions,
  type AuthSession,
} from '../auth/useAuth'
import { SettingsRow } from './SettingsSection'

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
 *
 * ── This is ticket 11's worked example (I1). ────────────────────────────────
 *
 * Every string a person reads comes from `useCopy()`, which returns the whole
 * typed catalog for the active locale; nothing here decides *which* locale, and
 * nothing here needs to. Three shapes worth copying onto the next screen:
 *
 *   1. A plain string is a property:      c.sessions.title
 *   2. A string with a value in it is a   c.sessions.clientOn(browser, os)
 *      function, so the argument count is typechecked.
 *   3. A counted string is the same       c.sessions.ago.hours(3)
 *      thing, with `Intl.PluralRules` inside `en.ts`.
 *
 * The two helpers below take the catalog as an argument rather than calling
 * `useCopy()` themselves, because they are not components. That is the pattern
 * for anything outside a component too — a zod schema, a table of labels — and
 * it is why `copyFor(locale)` exists beside the hook.
 */
export function ActiveSessions() {
  const c = useCopy().settings.sessions
  const { data: sessions, isPending, isError, error } = useAuthSessions()
  const revoke = useRevokeAuthSession()
  const revokeOthers = useRevokeOtherAuthSessions()
  const working = useCopy().common.working

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
        {/* The server's message, already in the caller's language (11 I3). */}
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
        <SettingsRow
          className="mt-3 border-t border-border pt-4"
          title={c.signOutOthers.title}
          description={c.signOutOthers.description}
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={revokeOthers.isPending}
              onClick={() => revokeOthers.mutate()}
            >
              <LogOut />
              {revokeOthers.isPending ? working : c.signOutOthers.action}
            </Button>
          }
        />
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
  const copy = useCopy()
  const c = copy.settings.sessions

  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <Monitor className="size-4 shrink-0 text-subtle-fg" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-card-fg">
          {describeClient(session.userAgent, copy)}
          {session.current && (
            <span className="ml-2 text-xs font-normal text-muted-fg">{c.currentDevice}</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-fg">
          {session.ip ?? c.unknownAddress} · {c.lastActive(relativeTime(session.lastSeen, copy))}
        </p>
      </div>

      {/*
        The current session gets a revoke button too. It is a logout, and
        labelling it honestly is better than hiding it and leaving someone to
        wonder why one row cannot be ended.
      */}
      <Button variant="ghost" size="sm" disabled={disabled} onClick={onRevoke}>
        {session.current ? c.signOutCurrent : c.endSession}
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
 *
 * The names themselves are the same word in every language, so they are not in
 * the catalog. Only the sentence that joins them is.
 */
function describeClient(userAgent: string | undefined, copy: Copy): string {
  const c = copy.settings.sessions
  if (!userAgent) return c.unknownDevice

  // i18n-exempt: browser names are proper nouns, identical in both locales.
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : null

  // i18n-exempt: platform names are proper nouns, identical in both locales.
  const platform =
    /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Linux/.test(userAgent) ? 'Linux'
    : null

  if (browser && platform) return c.clientOn(browser, platform)
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
 *
 * The thresholds are the same in both languages; only the sentences differ,
 * and the plural forms live in the catalog rather than here. English needs
 * "1 hour" against "3 hours" and Indonesian does not, which is exactly the
 * distinction `Intl.PluralRules` exists to keep out of this function.
 */
function relativeTime(iso: string, copy: Copy): string {
  const c = copy.settings.sessions.ago
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return c.justNow

  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 10) return c.justNow
  if (minutes < 60) return c.minutes(minutes)

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return c.hours(hours)

  const days = Math.floor(hours / 24)
  if (days === 1) return c.yesterday
  if (days < 30) return c.days(days)
  return c.overAMonth
}
