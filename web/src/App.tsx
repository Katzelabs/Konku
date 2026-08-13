import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Loading } from './components/ui/spinner'
import { Notice } from './components/ui/notice'
import LoginPage from './features/auth/LoginPage'
import ForgotPasswordPage from './features/auth/ForgotPasswordPage'
import PrivacyPage from './features/legal/PrivacyPage'
import TermsPage from './features/legal/TermsPage'
import ResetPasswordPage from './features/auth/ResetPasswordPage'
import SignupPage from './features/auth/SignupPage'
import VerifyPage from './features/auth/VerifyPage'
import VerifyPendingPage from './features/auth/VerifyPendingPage'
import { useMe } from './features/auth/useAuth'
import CardsPage from './features/cards/CardsPage'
import CardEditorPage from './features/cards/CardEditorPage'
import CategoriesPage from './features/categories/CategoriesPage'
import DomainsPage from './features/domains/DomainsPage'
import HomePage from './features/home/HomePage'
import NoteEditorPage from './features/notes/NoteEditorPage'
import NotesPage from './features/notes/NotesPage'
import ReviewHomePage from './features/review/ReviewHomePage'
import ReviewPage from './features/review/ReviewPage'
import ReviewSetPage from './features/review/ReviewSetPage'
import RunPage from './features/review/RunPage'
import AboutSettings from './features/settings/AboutSettings'
import AccountSettings from './features/settings/AccountSettings'
import AppearanceSettings from './features/settings/AppearanceSettings'
import DataSettings from './features/settings/DataSettings'
import SessionsSettings from './features/settings/SessionsSettings'
import SettingsLayout from './features/settings/SettingsLayout'
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

  /*
   * The verification link is checked before anything else about the session.
   *
   * It arrives in a mailbox, so whoever opens it may be signed out, signed in
   * but unverified, or already verified and clicking an old message. Gating it
   * behind the login screen would mean the most common case — clicking the
   * link on a device that never signed in — lands on a form instead.
   */
  if (location.pathname === '/verify') return <VerifyPage />
  if (location.pathname === '/reset-password') return <ResetPasswordPage />

  /*
   * The two documents, reachable in every authentication state and outside the
   * app shell. The moments someone wants them are before signing up and after
   * deciding to leave, and neither is a moment they are inside the app.
   */
  if (location.pathname === '/privacy') return <PrivacyPage />
  if (location.pathname === '/terms') return <TermsPage />

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        {/* Recovery is not a registration feature, so it is here whether or
            not ALLOW_SIGNUP is on: a closed instance still has accounts, and
            they still have people who forget passwords. */}
        <Route path="/forgot" element={<ForgotPasswordPage />} />
        {/* Any other path while signed out is the login screen, not a 404:
            a deep link is where to return to after signing in. */}
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  /*
   * Signed in, but the address is not confirmed.
   *
   * Every data route answers 403 for this account (07 L3), so rendering the app
   * shell would produce a screen of failed panels that reads as a bug. This is
   * the one state where the whole app is replaced by an explanation.
   */
  if (!user.emailVerified) return <VerifyPendingPage email={user.email} />

  return (
    <TimerProvider>
      <PeekProvider
        peekedPath={background ? location.pathname : null}
        background={background}
      >
        <AppShell user={user}>
          {/*
            One `<Routes>`, matched against the list's location while a peek is
            open. The preview is no longer a second `<Routes>` rendered beside
            this one: it is a column of the index page, which is what lets the
            two share a header and a height (see ListDetail). The index already
            knows which of its own rows is open, from `usePeekedId`.
          */}
          <Routes location={background ?? location}>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />

            {/*
              Index and editor are siblings. The editor gets the full width,
              which is what lets it show write and preview side by side rather
              than as a mode; the index splits its own width in two.
            */}
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:id" element={<NoteEditorPage />} />

            {/* Cards are a peer feature with the same two shapes (D-055). */}
            <Route path="/cards" element={<CardsPage />} />
            <Route path="/cards/new" element={<CardEditorPage />} />
            <Route path="/cards/:id" element={<CardEditorPage />} />
            {/*
              Ulangan is one section (D-075). /review leads with today's
              scheduled queue; /review/due is that queue; sets and their runs
              hang underneath so the URL says which of the two you are in.
            */}
            <Route path="/review" element={<ReviewHomePage />} />
            <Route path="/review/due" element={<ReviewPage />} />
            <Route path="/review/sets/:id" element={<ReviewSetPage />} />
            <Route path="/review/runs/:id" element={<RunPage />} />
            <Route path="/timer" element={<TimerPage />} />
            {/*
              Pengaturan is a shell with one section in it at a time, not a
              column with all of them stacked. The layout route is pathless on
              purpose: /domains and /categories were linkable before the split
              and keep their URLs, while still rendering inside the rail that
              says where you are.
            */}
            <Route element={<SettingsLayout />}>
              <Route path="/settings/akun" element={<AccountSettings />} />
              <Route path="/settings/perangkat" element={<SessionsSettings />} />
              <Route path="/settings/tampilan" element={<AppearanceSettings />} />
              <Route path="/settings/data" element={<DataSettings />} />
              <Route path="/settings/tentang" element={<AboutSettings />} />
              <Route path="/domains" element={<DomainsPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
            </Route>
            {/*
              Everything that linked to Pengaturan before the split — the
              sidebar, the account menu, Beranda's "Atur", a bookmark — lands
              on the first section. `replace`, so Back from there goes where
              you came from rather than bouncing through the redirect.
            */}
            <Route path="/settings" element={<Navigate to="/settings/akun" replace />} />

            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </AppShell>
      </PeekProvider>
    </TimerProvider>
  )
}
