import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/ui/button'
import { useCopy } from '../../i18n'
import { CheckYourMail } from './CheckYourMail'
import { meQueryKey, useLogout } from './useAuth'
import { AuthLayout } from './AuthLayout'

/**
 * What a signed-in but unverified account sees instead of the app.
 *
 * This screen exists because the alternative is worse: without it, the session
 * is valid, the app shell renders, and every panel fails with a 403 that reads
 * as a bug. The account is not broken and the person has not done anything
 * wrong — they are waiting on an email — so the copy says exactly that and
 * offers the two things that help (D-057's "never punitive" applies here as
 * much as anywhere).
 *
 * The body is shared with the signup success screen, which is the same
 * sentence to the same person a moment earlier. Only the way out differs: from
 * here you are signed in, so the escape is signing out rather than a link back
 * to a login form you have already been through.
 */
export default function VerifyPendingPage({ email }: { email: string }) {
  const c = useCopy().auth.checkMail
  const logout = useLogout()
  const qc = useQueryClient()

  /*
   * Re-read the account when the tab comes back to the front.
   *
   * The journey this screen is in the middle of leaves the browser: you open
   * your mail, click the link, it opens in another tab, and you come back
   * here. Until now the copy handled that by asking people to reload the page,
   * which works and is also the app admitting it does not notice.
   *
   * Scoped to this screen rather than turning `refetchOnWindowFocus` back on
   * globally (D-044's cache settings are deliberate): this is the one screen
   * whose whole content is a fact that routinely changes while you are looking
   * at a different window.
   */
  useEffect(() => {
    function recheck() {
      if (document.visibilityState === 'visible') {
        qc.invalidateQueries({ queryKey: meQueryKey })
      }
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [qc])

  return (
    <AuthLayout title={c.title} subtitle={c.subtitle}>
      <CheckYourMail email={email}>
        <Button
          variant="ghost"
          size="lg"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {c.signOut}
        </Button>
      </CheckYourMail>
    </AuthLayout>
  )
}
