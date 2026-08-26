import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { PasswordInput } from '../../components/ui/password-input'
import { useCopy } from '../../i18n'
import { useZodForm } from '../../lib/useZodForm'
import { loginSchema } from './schemas'
import { useAuthConfig, useLogin } from './useAuth'
import { AuthLayout } from './AuthLayout'

/**
 * The one word on these screens that is not translated, and the reason it is
 * spelled out here rather than typed into the JSX: a product name is a proper
 * noun. It reads the same in both locales, so putting it in the catalog would
 * create two keys that must never diverge.
 */
const PRODUCT_NAME = 'Konku' // i18n-exempt: product name, not copy

export default function LoginPage() {
  const copy = useCopy().auth
  const c = copy.login
  const login = useLogin()
  const { data: config } = useAuthConfig()

  const form = useZodForm(loginSchema, { email: '', password: '' })

  return (
    <AuthLayout title={PRODUCT_NAME} subtitle={c.subtitle}>
      <Card className="p-6">
        <form
          onSubmit={form.handleSubmit((values) => login.mutate(values))}
          noValidate
          className="flex flex-col gap-4"
        >
          {/*
            noValidate on the form, deliberately. The browser's own bubble
            appears in the browser's language, in the browser's words, on one
            field at a time, and it cannot say "the passwords do not match".
            The schema does all of it, in the reader's language, next to the
            field.
          */}
          <Field id="email" label={c.email} error={form.errors.email}>
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

          <Field id="password" label={c.password} error={form.errors.password}>
            {(a11y) => (
              <PasswordInput
                {...a11y}
                {...form.field('password')}
                // Deliberately bare. There is nothing useful to say into a
                // login password box — you either know it or you are on the
                // wrong screen — and a row of fake dots as a placeholder is
                // the one hint that can be mistaken for a value already
                // filled in.
                autoComplete="current-password"
                required
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
             * server answers one message for both, on purpose, because saying
             * which one was wrong lets anyone enumerate
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
            {login.isPending ? c.submitting : c.submit}
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
            {c.forgot}
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
          {c.noAccount}{' '}
          <Link
            to="/signup"
            className="font-medium text-surface-fg underline underline-offset-4"
          >
            {c.createAccount}
          </Link>
        </p>
      )}
    </AuthLayout>
  )
}
