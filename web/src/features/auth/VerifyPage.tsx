import { Link, useSearchParams } from 'react-router-dom'
import { CircleCheck, MailWarning } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Loading } from '../../components/ui/spinner'
import { Notice } from '../../components/ui/notice'
import { useVerifyToken } from './useAuth'
import { AuthLayout } from './AuthLayout'

/**
 * The page the verification link lands on.
 *
 * Reachable in every authentication state on purpose: the link is opened from
 * a mailbox, and the person clicking it may be signed out, signed in but
 * unverified, or already done and clicking an old message.
 */
export default function VerifyPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const verify = useVerifyToken(token)

  if (!token) {
    return (
      <VerifyFailed message="Tautan ini tidak lengkap. Buka tautan dari email kamu ya." />
    )
  }

  if (verify.isPending) {
    return (
      <AuthLayout title="Memverifikasi…">
        <Card className="flex items-center justify-center p-8">
          <Loading />
        </Card>
      </AuthLayout>
    )
  }

  if (verify.isError) {
    return <VerifyFailed message={verify.error.message} />
  }

  return (
    <AuthLayout title="Email terverifikasi" subtitle="Akun kamu sudah aktif.">
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
          <CircleCheck className="size-5" />
        </span>
        <p className="text-sm text-secondary-fg">
          Terima kasih. Sekarang kamu bisa masuk dan mulai menulis.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-1 w-full">
          <Link to="/login">Masuk</Link>
        </Button>
      </Card>
    </AuthLayout>
  )
}

/**
 * Expired, already used and never valid all land here with the same words.
 *
 * That is the server's shape too — one `invalid_token` for all three — because
 * telling them apart tells an attacker which guesses were close. The way out
 * is the same in every case, so the screen offers it rather than explaining.
 */
function VerifyFailed({ message }: { message: string }) {
  return (
    <AuthLayout title="Tautan tidak berlaku">
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
          <MailWarning className="size-5" />
        </span>
        <Notice role="alert" className="w-full">
          {message}
        </Notice>
        <p className="text-sm text-muted-fg">
          Masuk dengan akun kamu untuk meminta tautan baru.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-1 w-full">
          <Link to="/login">Ke halaman masuk</Link>
        </Button>
      </Card>
    </AuthLayout>
  )
}
