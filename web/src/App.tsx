import LoginPage from './features/auth/LoginPage'
import { useLogout, useMe } from './features/auth/useAuth'

export default function App() {
  const { data: user, isPending, error } = useMe()
  const logout = useLogout()

  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-slate-500">Memuat…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-sm p-6 pt-24">
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Tidak bisa menghubungi server. Coba muat ulang halaman.
        </p>
      </main>
    )
  }

  if (!user) return <LoginPage />

  // Placeholder shell. The note list, editor, review screen and timer land in
  // 03-app.md (A4–A7); routing arrives with them.
  return (
    <main className="mx-auto max-w-xl p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Konku</h1>
        <button
          onClick={() => logout.mutate()}
          className="text-sm text-slate-500 underline underline-offset-4"
        >
          Keluar
        </button>
      </header>

      <p className="mt-2 text-slate-600">Masuk sebagai {user.email}.</p>
      <p className="mt-6 text-sm text-slate-500">
        Catatan, ulangan, dan timer akan muncul di sini.
      </p>
    </main>
  )
}
