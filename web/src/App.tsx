import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Loading } from './components/ui/spinner'
import { Notice } from './components/ui/notice'
import LoginPage from './features/auth/LoginPage'
import { useMe } from './features/auth/useAuth'
import CardsPage from './features/cards/CardsPage'
import CardEditorPage from './features/cards/CardEditorPage'
import DomainsPage from './features/domains/DomainsPage'
import ExamPage from './features/exams/ExamPage'
import ExamsPage from './features/exams/ExamsPage'
import SitExamPage from './features/exams/SitExamPage'
import HomePage from './features/home/HomePage'
import NoteEditorPage from './features/notes/NoteEditorPage'
import NotesPage from './features/notes/NotesPage'
import ReviewPage from './features/review/ReviewPage'
import SettingsPage from './features/settings/SettingsPage'
import { TimerProvider } from './features/timer/TimerProvider'
import TimerPage from './features/timer/TimerPage'

export default function App() {
  const { data: user, isPending, error } = useMe()

  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loading />
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-sm p-6 pt-24">
        <Notice>Tidak bisa menghubungi server. Coba muat ulang halaman.</Notice>
      </main>
    )
  }

  if (!user) return <LoginPage />

  return (
    <TimerProvider>
      <AppShell email={user.email}>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />

          {/*
            Index and editor are siblings, not a two-pane layout. The editor
            gets the full width, which is what lets it show write and preview
            side by side rather than as a mode.
          */}
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/notes/:id" element={<NoteEditorPage />} />

          {/* Cards are a peer feature with the same two shapes (D-055). */}
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/cards/new" element={<CardEditorPage />} />
          <Route path="/cards/:id" element={<CardEditorPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/:id" element={<ExamPage />} />
          <Route path="/attempts/:id" element={<SitExamPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Its own route, reached from Pengaturan rather than the nav. */}
          <Route path="/domains" element={<DomainsPage />} />

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </AppShell>
    </TimerProvider>
  )
}
