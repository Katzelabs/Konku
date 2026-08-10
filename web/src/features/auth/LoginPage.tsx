import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Notice } from '../../components/ui/notice'
import { useAuthConfig, useLogin } from './useAuth'
import { AuthLayout } from './AuthLayout'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()
  const { data: config } = useAuthConfig()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    login.mutate({ email, password })
  }

  return (
    <AuthLayout title="Konku" subtitle="Masuk untuk melanjutkan.">
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
              autoComplete="current-password"
            />
          </div>

          {login.isError && (
            /*
             * Calm, not alarming. GOALS.md rules out aggressive red and
             * anything that reads as punishment — a mistyped password is an
             * ordinary event, so it gets an ordinary colour.
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
            className="text-center text-sm text-muted-fg underline underline-offset-4"
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
