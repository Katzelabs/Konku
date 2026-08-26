import { useEffect, useRef, type ReactNode } from 'react'
import { MailCheck } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Notice } from '../../components/ui/notice'
import { useCopy } from '../../i18n'
import { Emphasis } from './emphasis'
import { useResendVerification } from './useAuth'
import { useResendCooldown } from './useResendCooldown'

/**
 * "We sent a link to this address", with a resend that makes you wait.
 *
 * Shared by the two screens that say it — the signup success state and the
 * signed-in-but-unverified screen — because they were drifting apart in the
 * ways that matter. Only one of them had a resend button at all, so someone
 * whose first mail never arrived had to go back and sign up again, on a form
 * that answers 204 for an address that already exists and sends nothing.
 *
 * The copy is careful for the same reason everywhere: `/auth/resend-verification`
 * answers 204 for an unknown address, an already-verified one and a genuine
 * resend alike (D-039). So the confirmation says a link was sent *if the
 * account still needs one*. It must never claim a message went out.
 */
export function CheckYourMail({
  email,
  justSent = false,
  children,
}: {
  email: string
  /**
   * True when arriving here *is* a message being sent — the signup success
   * screen, and nothing else.
   *
   * The distinction matters and is the reason this is a prop rather than a
   * plain start-on-mount. Signing in to an unverified account lands on this
   * same screen and sends nothing, so a wait imposed there would be sixty
   * seconds of nothing, charged for a mail that was never sent, on the one
   * button that unsticks the account.
   */
  justSent?: boolean
  /** What to offer after the resend — sign out, or back to the login screen. */
  children?: ReactNode
}) {
  const c = useCopy().auth.checkMail
  const resend = useResendVerification()
  // Keyed by address, so signing out and in as someone else does not inherit
  // the previous account's wait.
  const cooldown = useResendCooldown(email)

  // Once per mount at most. `start` changes identity with the address, and a
  // dependency on it alone would restart the wait on every re-render that
  // happened to produce a new one.
  const started = useRef(false)
  useEffect(() => {
    if (!justSent || started.current) return
    started.current = true
    cooldown.start()
  }, [justSent, cooldown])

  const blocked = cooldown.waiting || resend.isPending

  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
        <MailCheck className="size-5" />
      </span>

      <p className="text-sm text-secondary-fg">
        <Emphasis text={c.sentTo(email)} />
      </p>
      <p className="text-sm text-muted-fg">{c.expiry}</p>

      {resend.isSuccess && (
        <Notice role="status" className="w-full">
          {c.resent}
        </Notice>
      )}
      {resend.isError && (
        <Notice role="alert" className="w-full">
          {resend.error.message}
        </Notice>
      )}

      <div className="mt-1 flex w-full flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          disabled={blocked}
          onClick={() => {
            // The wait starts on the press, not on the response. Starting it in
            // onSuccess would leave the button live during the request, and two
            // quick clicks would be two messages.
            cooldown.start()
            resend.mutate(email)
          }}
        >
          {resend.isPending
            ? c.resending
            : cooldown.waiting
              ? c.resendIn(cooldown.remaining)
              : c.resend}
        </Button>

        {/*
          The countdown is in the button's own label, so a disabled control
          always says why it is disabled. A greyed-out button with no
          explanation is the version of this that gets clicked repeatedly and
          reported as broken.

          aria-live so the wait is announced as it changes, and polite so it
          waits for a pause rather than interrupting. The whole label is the
          live region, which is why the label carries the number rather than a
          separate line under the button.
        */}
        <p aria-live="polite" className="sr-only">
          {cooldown.waiting
            ? c.resendWaitAnnounce(cooldown.remaining)
            : c.resendReadyAnnounce}
        </p>

        {children}
      </div>
    </Card>
  )
}
