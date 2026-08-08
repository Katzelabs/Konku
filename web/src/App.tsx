import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Loading } from './components/ui/spinner'
import { Notice } from './components/ui/notice'
import LoginPage from './features/auth/LoginPage'
import { useMe } from './features/auth/useAuth'
import CardsPage from './features/cards/CardsPage'
import CardEditorPage from './features/cards/CardEditorPage'
import CardPeekRoute from './features/cards/CardPeekRoute'
import DomainsPage from './features/domains/DomainsPage'
import ExamPage from './features/exams/ExamPage'
import ExamsPage from './features/exams/ExamsPage'
import SitExamPage from './features/exams/SitExamPage'
import HomePage from './features/home/HomePage'
import NoteEditorPage from './features/notes/NoteEditorPage'
import NotePeekRoute from './features/notes/NotePeekRoute'
import NotesPage from './features/notes/NotesPage'
import ReviewPage from './features/review/ReviewPage'
import SettingsPage from './features/settings/SettingsPage'
import { usePeekMode } from './components/ui/peek-panel'
import { PeekProvider, usePeekBackground } from './lib/peek-route'
import { TimerProvider } from './features/timer/TimerProvider'
import TimerPage from './features/timer/TimerPage'

export default function App() {
  const { data: user, isPending, error } = useMe()
  const location = useLocation()

  // Set when a peek was opened over a list. The main routes then render
  // against the list's location while the URL — and the peek — stay on the
  // item, so `/notes/:id` is what the address bar says without the list
  // unmounting underneath.
  const background = usePeekBackground()
  const [peekMode] = usePeekMode()

  // The side peek is a fixed panel, so without this the list would run
  // underneath it — and clicking a covered row to swap the preview is the
  // whole reason side peek is not a modal. Inset the content instead of
  // letting the panel sit on top of it. Only from `xl`: below that the panel
  // is effectively full width and covering the list is the right behaviour.
  const insetForPeek = background !== null && peekMode === 'side'

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
      <PeekProvider peekedPath={background ? location.pathname : null}>
        <AppShell email={user.email}>
          <div className={insetForPeek ? 'xl:pr-[34rem]' : undefined}>
            <Routes location={background ?? location}>
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
          </div>

          {/*
            The peek, matched against the real location. Only these two paths
            peek; everything else opens as a page, and a direct visit with no
            background state falls through to the editor above.
          */}
          {background && (
            <Routes>
              <Route path="/notes/:id" element={<NotePeekRoute />} />
              <Route path="/cards/:id" element={<CardPeekRoute />} />
            </Routes>
          )}
        </AppShell>
      </PeekProvider>
    </TimerProvider>
  )
}
