import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CircleCheck, MailWarning } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Notice } from '../../components/ui/notice'
import { useResetPassword } from './useAuth'
import { AuthLayout } from './AuthLayout'

/** Matches minPasswordLength in the API and in `konku seed-user`. */
const MIN_PASSWORD = 12

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
  const [password, setPassword] = useState('')
  const reset = useResetPassword()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    reset.mutate({ token, password })
  }

  if (!token) {
    return (
      <ResetFailed message="Tautan ini tidak lengkap. Buka tautan dari email kamu ya." />
    )
  }

  /*
   * Every session for the account is gone by now, including this browser's, so
   * there is nowhere to send them but the login screen. That is the feature
   * working, not a rough edge: a reset that left a session alive would leave
   * an attacker's session alive too.
   */
  if (reset.isSuccess) {
    return (
      <AuthLayout title="Kata sandi diperbarui">
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
            <CircleCheck className="size-5" />
          </span>
          <p className="text-sm text-secondary-fg">
            Kata sandi kamu sudah diganti. Semua perangkat yang tadinya masuk sudah
            dikeluarkan, jadi silakan masuk lagi dengan kata sandi yang baru.
          </p>
          <Button asChild variant="primary" size="lg" className="mt-1 w-full">
            <Link to="/login">Masuk</Link>
          </Button>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Buat kata sandi baru">
      <Card className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Kata sandi baru</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              autoFocus
              aria-describedby="password-hint"
            />
            <p id="password-hint" className="text-sm text-muted-fg">
              Minimal {MIN_PASSWORD} karakter. Kalimat yang panjang lebih aman dan lebih
              mudah diingat.
            </p>
          </div>

          {reset.isError && <Notice role="alert">{reset.error.message}</Notice>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={reset.isPending}
            className="mt-2"
          >
            {reset.isPending ? 'Menyimpan…' : 'Simpan kata sandi'}
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
  return (
    <AuthLayout title="Tautan tidak berlaku">
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
          <MailWarning className="size-5" />
        </span>
        <Notice role="alert" className="w-full">
          {message}
        </Notice>
        <Button asChild variant="primary" size="lg" className="mt-1 w-full">
          <Link to="/forgot">Minta tautan baru</Link>
        </Button>
      </Card>
    </AuthLayout>
  )
}
