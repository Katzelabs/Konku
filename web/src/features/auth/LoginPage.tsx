import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { PasswordInput } from '../../components/ui/password-input'
import { useZodForm } from '../../lib/useZodForm'
import { loginSchema } from './schemas'
import { useAuthConfig, useLogin } from './useAuth'
import { AuthLayout } from './AuthLayout'

export default function LoginPage() {
  const login = useLogin()
  const { data: config } = useAuthConfig()

  const form = useZodForm(loginSchema, { email: '', password: '' })

  return (
    <AuthLayout title="Konku" subtitle="Masuk untuk melanjutkan.">
      <Card className="p-6">
        <form
          onSubmit={form.handleSubmit((values) => login.mutate(values))}
          noValidate
          className="flex flex-col gap-4"
        >
          {/*
            noValidate on the form, deliberately. The browser's own bubble
            appears in the browser's language, in the browser's words, on one
            field at a time, and it cannot say "kata sandinya belum sama". The
            schema does all of it, in Indonesian, next to the field.
          */}
          <Field id="email" label="Email" error={form.errors.email}>
            {(a11y) => (
              <Input
                {...a11y}
                {...form.field('email')}
                type="email"
                autoComplete="username"
                autoFocus
              />
            )}
          </Field>

          <Field id="password" label="Kata sandi" error={form.errors.password}>
            {(a11y) => (
              <PasswordInput
                {...a11y}
                {...form.field('password')}
                autoComplete="current-password"
              />
            )}
          </Field>

          {login.isError && (
            /*
             * Calm, not alarming. GOALS.md rules out aggressive red and
             * anything that reads as punishment — a mistyped password is an
             * ordinary event, so it gets an ordinary colour.
             *
             * Form-level rather than on a field, and that is not laziness: the
             * server answers "email atau kata sandi salah" for both, on purpose,
             * because saying which one was wrong lets anyone enumerate
             * registered addresses. Pinning it to one field would claim
             * knowledge the response does not carry.
             */
            <Notice role="alert">{login.error.message}</Notice>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={login.isPending}
            className="mt-2"
          >
            {login.isPending ? 'Sebentar…' : 'Masuk'}
          </Button>

          {/*
            Always present, unlike the signup link: recovery is not a
            registration feature, and /auth/forgot is mounted regardless of
            ALLOW_SIGNUP (07 L4).
          */}
          <Link
            to="/forgot"
            className="text-center text-sm text-muted-fg underline underline-offset-4 hover:text-surface-fg"
          >
            Lupa kata sandi?
          </Link>
        </form>
      </Card>

      {/*
        The link appears only where signup actually exists. ALLOW_SIGNUP is off
        by default — the correct default for a self-hosted box (D-039) — and a
        link that 404s is worse than no link at all. /auth/config is how the
        client knows before anyone has signed in.
      */}
      {config?.allowSignup && (
        <p className="text-center text-sm text-muted-fg">
          Belum punya akun?{' '}
          <Link
            to="/signup"
            className="font-medium text-surface-fg underline underline-offset-4"
          >
            Buat akun
          </Link>
        </p>
      )}
    </AuthLayout>
  )
}
