import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Notice } from '../../components/ui/notice'
import { useSignup } from './useAuth'
import { AuthLayout } from './AuthLayout'

/** Matches minPasswordLength in the API and in `konku seed-user`. */
const MIN_PASSWORD = 12

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const signup = useSignup()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    signup.mutate({ email, password })
  }

  /*
   * The success state is the whole point of this screen.
   *
   * Signup returns 204 with no session, and it returns the same 204 for an
   * address that is already registered — so this copy has to be true in both
   * cases. It says a link was sent to the address, not that an account was
   * created, because only one of those is guaranteed.
   */
  if (signup.isSuccess) {
    return (
      <AuthLayout title="Cek email kamu" subtitle="Tinggal satu langkah lagi.">
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
            <MailCheck className="size-5" />
          </span>
          <p className="text-sm text-secondary-fg">
            Kami sudah mengirim tautan verifikasi ke{' '}
            <span className="font-medium text-surface-fg">{email}</span>. Buka tautannya
            untuk mengaktifkan akun kamu.
          </p>
          <p className="text-sm text-muted-fg">
            Tautannya berlaku 24 jam. Kalau belum masuk juga, cek folder spam.
          </p>
          <Button asChild variant="secondary" size="lg" className="mt-1 w-full">
            <Link to="/login">Kembali ke halaman masuk</Link>
          </Button>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Buat akun" subtitle="Mulai simpan apa yang kamu pelajari.">
      <Card className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Kata sandi</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              aria-describedby="password-hint"
            />
            {/*
              Stated up front rather than as an error after submitting. A rule
              you only learn by breaking it is a rule that annoys, and the
              server's message says the same thing in the same words.
            */}
            <p id="password-hint" className="text-sm text-muted-fg">
              Minimal {MIN_PASSWORD} karakter. Kalimat yang panjang lebih aman dan lebih
              mudah diingat.
            </p>
          </div>

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
