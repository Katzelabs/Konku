import { MailCheck } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Notice } from '../../components/ui/notice'
import { useLogout, useResendVerification } from './useAuth'
import { AuthLayout } from './AuthLayout'

/**
 * What a signed-in but unverified account sees instead of the app.
 *
 * This screen exists because the alternative is worse: without it, the session
 * is valid, the app shell renders, and every panel fails with a 403 that reads
 * as a bug. The account is not broken and the person has not done anything
 * wrong — they are waiting on an email — so the copy says exactly that and
 * offers the two things that help (D-057's "never punitive" applies here as
 * much as anywhere).
 */
export default function VerifyPendingPage({ email }: { email: string }) {
  const resend = useResendVerification()
  const logout = useLogout()

  return (
    <AuthLayout title="Cek email kamu" subtitle="Tinggal satu langkah lagi.">
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
          <MailCheck className="size-5" />
        </span>

        <p className="text-sm text-secondary-fg">
          Kami sudah mengirim tautan verifikasi ke{' '}
          <span className="font-medium text-surface-fg">{email}</span>. Buka tautannya,
          lalu muat ulang halaman ini.
        </p>
        <p className="text-sm text-muted-fg">
          Belum ada emailnya? Cek folder spam, atau minta tautan baru.
        </p>

        {/*
          Always the same reassurance, because the server always answers 204 —
          it will not say whether a message actually went out, and this screen
          must not pretend to know more than the response carries.
        */}
        {resend.isSuccess && (
          <Notice role="status" className="w-full">
            Tautan baru sudah dikirim kalau akunnya memang belum terverifikasi.
          </Notice>
        )}
        {resend.isError && (
          <Notice role="alert" className="w-full">
            {resend.error.message}
          </Notice>
        )}

        <div className="mt-1 flex w-full flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            disabled={resend.isPending}
            onClick={() => resend.mutate(email)}
          >
            {resend.isPending ? 'Mengirim…' : 'Kirim ulang tautan'}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            Keluar
          </Button>
        </div>
      </Card>
    </AuthLayout>
  )
}
