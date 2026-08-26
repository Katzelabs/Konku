import { Link, useSearchParams } from 'react-router-dom'
import { CircleCheck, MailWarning } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Loading } from '../../components/ui/spinner'
import { Notice } from '../../components/ui/notice'
import { useCopy } from '../../i18n'
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
  const c = useCopy().auth.verify
  const verify = useVerifyToken(token)

  if (!token) {
    return <VerifyFailed message={c.failed.incompleteLink} />
  }

  if (verify.isPending) {
    return (
      <AuthLayout title={c.pending}>
        <Card className="flex items-center justify-center p-8">
          {/*
            The label is passed rather than left to the component's default,
            which is still Indonesian: `components/ui/` is out of scope for
            this conversion (11 I5), so the screen supplies the half it owns.
          */}
          <Loading label={c.loading} />
        </Card>
      </AuthLayout>
    )
  }

  if (verify.isError) {
    return <VerifyFailed message={verify.error.message} />
  }

  return (
    <AuthLayout title={c.done.title} subtitle={c.done.subtitle}>
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
          <CircleCheck className="size-5" />
        </span>
        <p className="text-sm text-secondary-fg">{c.done.body}</p>
        <Button asChild variant="primary" size="lg" className="mt-1 w-full">
          <Link to="/login">{c.done.signIn}</Link>
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
  const c = useCopy().auth.verify.failed

  return (
    <AuthLayout title={c.title}>
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary-fg">
          <MailWarning className="size-5" />
        </span>
        <Notice role="alert" className="w-full">
          {message}
        </Notice>
        <p className="text-sm text-muted-fg">{c.help}</p>
        <Button asChild variant="primary" size="lg" className="mt-1 w-full">
          <Link to="/login">{c.signIn}</Link>
        </Button>
      </Card>
    </AuthLayout>
  )
}
