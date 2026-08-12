import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { Notice } from '../../components/ui/notice'
import { useZodForm } from '../../lib/useZodForm'
import { forgotSchema } from './schemas'
import { useForgotPassword } from './useAuth'
import { AuthLayout } from './AuthLayout'

export default function ForgotPasswordPage() {
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
      <AuthLayout title="Cek email kamu">
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
            <MailCheck className="size-5" />
          </span>
          <p className="text-sm text-secondary-fg">
            Kalau{' '}
            <span className="font-medium text-surface-fg">{forgot.variables}</span>{' '}
            terdaftar, kami sudah mengirim tautan untuk mengatur ulang kata sandi ke
            sana.
          </p>
          <p className="text-sm text-muted-fg">
            Tautannya berlaku 1 jam. Kalau belum masuk juga, cek folder spam.
          </p>
          <Button asChild variant="secondary" size="lg" className="mt-1 w-full">
            <Link to="/login">Kembali ke halaman masuk</Link>
          </Button>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Lupa kata sandi"
      subtitle="Kami kirimkan tautan untuk membuat kata sandi baru."
    >
      <Card className="p-6">
        <form
          onSubmit={form.handleSubmit(({ email }) => forgot.mutate(email))}
          noValidate
          className="flex flex-col gap-4"
        >
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

          {forgot.isError && <Notice role="alert">{forgot.error.message}</Notice>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={forgot.isPending}
            className="mt-2"
          >
            {forgot.isPending ? 'Mengirim…' : 'Kirim tautan'}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-muted-fg">
        Ingat kata sandinya?{' '}
        <Link to="/login" className="font-medium text-surface-fg underline underline-offset-4">
          Masuk
        </Link>
      </p>
    </AuthLayout>
  )
}
