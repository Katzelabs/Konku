import { useState, type FormEvent } from 'react'
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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Konku</h1>
      <p className="mt-1 text-sm text-slate-500">Masuk untuk melanjutkan.</p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            autoFocus
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Kata sandi</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
        </label>

        {login.isError && (
          /*
           * Calm, not alarming. GOALS.md rules out aggressive red and anything
           * that reads as punishment — a mistyped password is an ordinary
           * event, so it gets an ordinary colour.
           */
          <p role="alert" className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {login.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-2 rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {login.isPending ? 'Sebentar…' : 'Masuk'}
        </button>
      </form>

      {/*
        No signup link on purpose: there is no public registration in the MVP.
        Accounts are created with `konku seed-user` (D-039).
      */}
    </main>
  )
}
