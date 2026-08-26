import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { PasswordInput } from '../../components/ui/password-input'
import { useCopy } from '../../i18n'
import { useZodForm } from '../../lib/useZodForm'
import { CheckYourMail } from './CheckYourMail'
import { MIN_PASSWORD, signupSchema } from './schemas'
import { useSignup } from './useAuth'
import { AuthLayout } from './AuthLayout'

export default function SignupPage() {
  const copy = useCopy().auth
  const c = copy.signup
  const signup = useSignup()

  const form = useZodForm(signupSchema, {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  /*
   * The success state is the whole point of this screen.
   *
   * Signup returns 204 with no session, and it returns the same 204 for an
   * address that is already registered — so this copy has to be true in both
   * cases. It says a link was sent to the address, not that an account was
   * created, because only one of those is guaranteed.
   *
   * The address shown is the *submitted* one, not what is in the input: the
   * schema trims, and telling someone we mailed " a@b.com " when we mailed
   * "a@b.com" is a difference they cannot see but their mail client can.
   */
  if (signup.isSuccess) {
    return (
      <AuthLayout title={copy.checkMail.title} subtitle={copy.checkMail.subtitle}>
        <CheckYourMail email={signup.variables.email} justSent>
          <Button asChild variant="ghost" size="lg">
            <Link to="/login">{copy.checkMail.backToLogin}</Link>
          </Button>
        </CheckYourMail>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={c.title} subtitle={c.subtitle}>
      <Card className="p-6">
        <form
          onSubmit={form.handleSubmit((values) => signup.mutate(values))}
          noValidate
          className="flex flex-col gap-4"
        >
          {/*
            Side by side, because they are one question. Stacked, the form is
            five full-width fields and reads as longer than it is — and
            capture cost is the thing to protect (hard rule 7), starting with
            the very first form anyone sees. They stack on a narrow phone,
            where two half-width inputs would be worse than the extra row.
          */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field
              id="firstName"
              label={c.firstName}
              error={form.errors.firstName}
              className="flex-1"
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  {...form.field('firstName')}
                  // An example, not a restatement of the label. What it
                  // actually teaches is the shape asked for: one name, not the
                  // full name someone would otherwise type into the first box
                  // and then have to cut in half.
                  placeholder={c.firstNamePlaceholder}
                  autoComplete="given-name"
                  required
                  autoFocus
                />
              )}
            </Field>

            {/*
              Optional, and it stays optional — plenty of people have one name,
              and a form that refuses to accept that is a form telling them
              they are wrong about their own name.

              Said in the placeholder rather than in the label, and backed by
              the *absence* of `required` on this one input. That second half
              matters: a placeholder is not reliably announced when a label is
              already present, so on its own it would drop the information for
              anyone not looking at the screen. `required` on the other four is
              what makes this one's silence mean something.
            */}
            <Field
              id="lastName"
              label={c.lastName}
              error={form.errors.lastName}
              className="flex-1"
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  {...form.field('lastName')}
                  placeholder={c.lastNamePlaceholder}
                  autoComplete="family-name"
                />
              )}
            </Field>
          </div>

          <Field id="email" label={c.email} error={form.errors.email}>
            {(a11y) => (
              <Input
                {...a11y}
                {...form.field('email')}
                type="email"
                // The format, shown rather than described. This is the field
                // people mistype, and "nama@email.com" answers the question
                // before the schema has to.
                placeholder={copy.emailPlaceholder}
                autoComplete="username"
                required
              />
            )}
          </Field>

          <Field
            id="password"
            label={c.password}
            error={form.errors.password}
            /*
              Stated up front rather than as an error after submitting. A rule
              you only learn by breaking it is a rule that annoys, and the
              server's message says the same thing in the same words.
            */
            hint={copy.password.hint(MIN_PASSWORD)}
          >
            {/*
              No placeholder here, and that is the considered choice rather
              than an omission. The rule already sits under the field, where it
              stays readable *while* you type — a placeholder saying the same
              thing would vanish at the first keystroke, which is exactly when
              someone is checking whether they have reached twelve characters.
            */}
            {(a11y) => (
              <PasswordInput
                {...a11y}
                {...form.field('password')}
                autoComplete="new-password"
                required
              />
            )}
          </Field>

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

          {signup.isError && <Notice role="alert">{signup.error.message}</Notice>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={signup.isPending}
            className="mt-2"
          >
            {signup.isPending ? c.submitting : c.submit}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-muted-fg">
        {c.haveAccount}{' '}
        <Link to="/login" className="font-medium text-surface-fg underline underline-offset-4">
          {c.signIn}
        </Link>
      </p>
    </AuthLayout>
  )
}
