import { useState, type FormEvent } from 'react'
import { GraduationCap } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Notice } from '../../components/ui/notice'
import { useLogin } from './useAuth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    login.mutate({ email, password })
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-fg">
            <GraduationCap className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-surface-fg">
              Konku
            </h1>
            <p className="mt-1 text-sm text-muted-fg">Masuk untuk melanjutkan.</p>
          </div>
        </div>

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
          </form>
        </Card>

        {/*
          No signup link on purpose: there is no public registration in the MVP.
          Accounts are created with `konku seed-user` (D-039).
        */}
      </div>
    </main>
  )
}
