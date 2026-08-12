import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { PasswordInput } from '../../components/ui/password-input'
import { useZodForm } from '../../lib/useZodForm'
import { CheckYourMail } from './CheckYourMail'
import { MIN_PASSWORD, signupSchema } from './schemas'
import { useSignup } from './useAuth'
import { AuthLayout } from './AuthLayout'

export default function SignupPage() {
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
      <AuthLayout title="Cek email kamu" subtitle="Tinggal satu langkah lagi.">
        <CheckYourMail email={signup.variables.email} justSent>
          <Button asChild variant="ghost" size="lg">
            <Link to="/login">Kembali ke halaman masuk</Link>
          </Button>
        </CheckYourMail>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Buat akun" subtitle="Mulai simpan apa yang kamu pelajari.">
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
              label="Nama depan"
              error={form.errors.firstName}
              className="flex-1"
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  {...form.field('firstName')}
                  autoComplete="given-name"
                  autoFocus
                />
              )}
            </Field>

            {/*
              Optional, and marked as optional in words. Plenty of people have
              one name, and a form that refuses to accept that is a form
              telling them they are wrong about their own name.
            */}
            <Field
              id="lastName"
              label="Nama belakang"
              optional
              error={form.errors.lastName}
              className="flex-1"
            >
              {(a11y) => (
                <Input {...a11y} {...form.field('lastName')} autoComplete="family-name" />
              )}
            </Field>
          </div>

          <Field id="email" label="Email" error={form.errors.email}>
            {(a11y) => (
              <Input {...a11y} {...form.field('email')} type="email" autoComplete="username" />
            )}
          </Field>

          <Field
            id="password"
            label="Kata sandi"
            error={form.errors.password}
            /*
              Stated up front rather than as an error after submitting. A rule
              you only learn by breaking it is a rule that annoys, and the
              server's message says the same thing in the same words.
            */
            hint={`Minimal ${MIN_PASSWORD} karakter. Kalimat yang panjang lebih aman dan lebih mudah diingat.`}
          >
            {(a11y) => (
              <PasswordInput {...a11y} {...form.field('password')} autoComplete="new-password" />
            )}
          </Field>

          <Field
            id="confirmPassword"
            label="Ulangi kata sandi"
            error={form.errors.confirmPassword}
          >
            {(a11y) => (
              <PasswordInput
                {...a11y}
                {...form.field('confirmPassword')}
                autoComplete="new-password"
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
            {signup.isPending ? 'Sebentar…' : 'Buat akun'}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-muted-fg">
        Sudah punya akun?{' '}
        <Link to="/login" className="font-medium text-surface-fg underline underline-offset-4">
          Masuk
        </Link>
      </p>
    </AuthLayout>
  )
}
