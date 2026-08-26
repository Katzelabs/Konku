import { Link, useSearchParams } from 'react-router-dom'
import { CircleCheck, MailWarning } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Field } from '../../components/ui/field'
import { Notice } from '../../components/ui/notice'
import { PasswordInput } from '../../components/ui/password-input'
import { useCopy } from '../../i18n'
import { useZodForm } from '../../lib/useZodForm'
import { MIN_PASSWORD, resetSchema } from './schemas'
import { useResetPassword } from './useAuth'
import { AuthLayout } from './AuthLayout'

/**
 * The page the reset link lands on.
 *
 * Like the verification page it is reachable in every authentication state,
 * because the link comes from a mailbox. Unlike it, nothing happens on mount:
 * the token is only spent when a password is submitted, so a mail scanner
 * following the URL costs the user nothing.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const copy = useCopy().auth
  const c = copy.reset
  const reset = useResetPassword()

  const form = useZodForm(resetSchema, { password: '', confirmPassword: '' })

  if (!token) {
    return <ResetFailed message={c.failed.incompleteLink} />
  }

  /*
   * Every session for the account is gone by now, including this browser's, so
   * there is nowhere to send them but the login screen. That is the feature
   * working, not a rough edge: a reset that left a session alive would leave
   * an attacker's session alive too.
   */
  if (reset.isSuccess) {
    return (
      <AuthLayout title={c.done.title}>
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
            <CircleCheck className="size-5" />
          </span>
          <p className="text-sm text-secondary-fg">{c.done.body}</p>
          <Button asChild variant="primary" size="lg" className="mt-1 w-full">
            <Link to="/login">{c.done.signIn}</Link>
          </Button>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={c.title}>
      <Card className="p-6">
        <form
          onSubmit={form.handleSubmit(({ password }) => reset.mutate({ token, password }))}
          noValidate
          className="flex flex-col gap-4"
        >
          <Field
            id="password"
            label={c.password}
            error={form.errors.password}
            hint={copy.password.hint(MIN_PASSWORD)}
          >
            {(a11y) => (
              <PasswordInput
                {...a11y}
                {...form.field('password')}
                autoComplete="new-password"
                required
                autoFocus
              />
            )}
          </Field>

          {/*
            The confirm field matters more here than at signup, and for a
            reason worth stating: this is the last screen before every session
            is revoked. A typo at signup means trying again; a typo here means
            being locked out of an account whose only recovery path is the link
            that was just spent.
          */}
          <Field
            id="confirmPassword"
            label={c.confirmPassword}
            error={form.errors.confirmPassword}
          >
            {(a11y) => (
              <PasswordInput
                {...a11y}
                {...form.field('confirmPassword')}
                placeholder={copy.password.confirmPlaceholder}
                autoComplete="new-password"
                required
              />
            )}
          </Field>

          {reset.isError && <Notice role="alert">{reset.error.message}</Notice>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={reset.isPending}
            className="mt-2"
          >
            {reset.isPending ? c.submitting : c.submit}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  )
}

/**
 * Expired, spent and never-valid all read the same here, because they read the
 * same from the server — telling them apart tells an attacker which guesses
 * were close. The way out is identical in every case, so the screen offers it.
 */
function ResetFailed({ message }: { message: string }) {
  const c = useCopy().auth.reset.failed

  return (
    <AuthLayout title={c.title}>
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
          <MailWarning className="size-5" />
        </span>
        <Notice role="alert" className="w-full">
          {message}
        </Notice>
        <Button asChild variant="primary" size="lg" className="mt-1 w-full">
          <Link to="/forgot">{c.requestNew}</Link>
        </Button>
      </Card>
    </AuthLayout>
  )
}
