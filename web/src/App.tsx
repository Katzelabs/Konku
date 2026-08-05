import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './features/auth/LoginPage'
import { useLogout, useMe } from './features/auth/useAuth'
import NoteEditorPage from './features/notes/NoteEditorPage'
import NoteListPage from './features/notes/NoteListPage'
import ReviewPage from './features/review/ReviewPage'
import { useDueCards } from './features/review/queries'
import TimerPage from './features/timer/TimerPage'

export default function App() {
  const { data: user, isPending, error } = useMe()

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

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-6">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/notes" replace />} />
          <Route path="/notes" element={<NoteListPage />} />
          <Route path="/notes/:id" element={<NoteEditorPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="*" element={<Navigate to="/notes" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Nav() {
  const logout = useLogout()
  const due = useDueCards()

  return (
    <header className="flex items-center justify-between border-b border-slate-100 pb-4">
      <nav className="flex items-center gap-1">
        <Tab to="/notes">Catatan</Tab>
        <Tab to="/review">
          Ulangan
          {/*
            A quiet count, not a badge demanding attention. There is no home
            screen in the MVP, so this is the only place that says whether
            anything is waiting — it stays grey and says nothing at zero,
            because an empty day is a normal day and not a failure to fix
            (GOALS.md).
          */}
          {due.data && due.data.total > 0 && (
            <span className="ml-1.5 text-xs text-slate-400">{due.data.total}</span>
          )}
        </Tab>
        <Tab to="/timer">Fokus</Tab>
      </nav>

      <button
        onClick={() => logout.mutate()}
        className="text-sm text-slate-400 underline underline-offset-4"
      >
        Keluar
      </button>
    </header>
  )
}

function Tab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm ${
          isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-500'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
