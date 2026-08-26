import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { useCopy } from '../../i18n'
import { useZodForm } from '../../lib/useZodForm'
import { forgotSchema } from './schemas'
import { useForgotPassword } from './useAuth'
import { AuthLayout } from './AuthLayout'
import { Emphasis } from './emphasis'

export default function ForgotPasswordPage() {
  const copy = useCopy().auth
  const c = copy.forgot
  const forgot = useForgotPassword()
  const form = useZodForm(forgotSchema, { email: '' })

  /*
   * The success copy is conditional, and has to be.
   *
   * The endpoint answers 204 whether or not the address has an account — an
   * endpoint that answered differently would be a way to test who uses this
   * app (D-039, D-066). So this screen cannot say "we sent you an email"; it
   * says what is actually true, which is that a link is on its way *if* the
   * address is registered.
   *
   * Note there is no resend button here, unlike the verification screen, and
   * that is deliberate rather than an omission: the way to ask again is to
   * submit the form again, which is right there. A resend would need the
   * address to be remembered across a screen whose whole point is that we will
   * not say whether it exists.
   */
  if (forgot.isSuccess) {
    return (
      <AuthLayout title={c.sent.title}>
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
            <MailCheck className="size-5" />
          </span>
          <p className="text-sm text-secondary-fg">
            <Emphasis text={c.sent.body(forgot.variables)} />
          </p>
          <p className="text-sm text-muted-fg">{c.sent.expiry}</p>
          <Button asChild variant="secondary" size="lg" className="mt-1 w-full">
            <Link to="/login">{c.sent.backToLogin}</Link>
          </Button>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={c.title} subtitle={c.subtitle}>
      <Card className="p-6">
        <form
          onSubmit={form.handleSubmit(({ email }) => forgot.mutate(email))}
          noValidate
          className="flex flex-col gap-4"
        >
          {/*
            The hint is the whole point of this one. Someone here has already
            forgotten something, and the failure this screen actually produces
            is a link sent to a second address they also own — which answers
            204 like everything else, so nothing on screen ever tells them why
            no mail arrived.
          */}
          <Field
            id="email"
            label={c.email}
            hint={c.emailHint}
            error={form.errors.email}
          >
            {(a11y) => (
              <Input
                {...a11y}
                {...form.field('email')}
                type="email"
                placeholder={copy.emailPlaceholder}
                autoComplete="username"
                required
                autoFocus
              />
            )}
          </Field>

          {forgot.isError && <Notice role="alert">{forgot.error.message}</Notice>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={forgot.isPending}
            className="mt-2"
          >
            {forgot.isPending ? c.submitting : c.submit}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-muted-fg">
        {c.rememberedIt}{' '}
        <Link to="/login" className="font-medium text-surface-fg underline underline-offset-4">
          {c.signIn}
        </Link>
      </p>
    </AuthLayout>
  )
}
