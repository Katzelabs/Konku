import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RouteErrorBoundary } from './components/error-boundary'
import { Loading } from './components/ui/spinner'
import { Notice } from './components/ui/notice'
import LoginPage from './features/auth/LoginPage'
import { useMe } from './features/auth/useAuth'
import { PeekProvider, usePeekBackground } from './lib/peek-route'

/*
 * Every screen except the login form is its own chunk (F-09).
 *
 * The build was one 805 kB file: every route, the markdown renderer, all five
 * Radix packages, zod and the whole lucide import graph were in the first byte
 * the *login screen* needed, so a signed-out visitor downloaded the entire
 * application to look at an email field. Over Indonesian mobile data that is
 * the difference between a working deploy and a considered one.
 *
 * LoginPage stays eager on purpose: it is what a signed-out visitor is here
 * for, and making it lazy would trade a smaller entry for a second round trip
 * before anything renders. Everything else is behind a click or a session.
 *
 * Rollup handles the rest on its own — a module two lazy routes share becomes
 * a chunk they both fetch, so the markdown renderer lands beside the note and
 * card screens rather than in the entry. `manualChunks` in vite.config.ts only
 * pins the framework, which is stable across deploys and always needed.
 */
/*
 * The shell and the timer are lazy for the same reason the screens are: the
 * sidebar, the bottom nav, the account menu and the capture gate are the
 * signed-in application, and a signed-out visitor was downloading all of it —
 * along with the Radix menu and every icon they use — to see a login form.
 * Named exports, hence the `.then`.
 */
const AppShell = lazy(() =>
  import('./components/layout/AppShell').then((m) => ({ default: m.AppShell })),
)
const TimerProvider = lazy(() =>
  import('./features/timer/TimerProvider').then((m) => ({ default: m.TimerProvider })),
)

const ForgotPasswordPage = lazy(() => import('./features/auth/ForgotPasswordPage'))
const PrivacyPage = lazy(() => import('./features/legal/PrivacyPage'))
const TermsPage = lazy(() => import('./features/legal/TermsPage'))
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage'))
const SignupPage = lazy(() => import('./features/auth/SignupPage'))
const VerifyPage = lazy(() => import('./features/auth/VerifyPage'))
const VerifyPendingPage = lazy(() => import('./features/auth/VerifyPendingPage'))
const CardsPage = lazy(() => import('./features/cards/CardsPage'))
const CardEditorPage = lazy(() => import('./features/cards/CardEditorPage'))
const CategoriesPage = lazy(() => import('./features/categories/CategoriesPage'))
const DomainsPage = lazy(() => import('./features/domains/DomainsPage'))
const HomePage = lazy(() => import('./features/home/HomePage'))
const NoteEditorPage = lazy(() => import('./features/notes/NoteEditorPage'))
const NotesPage = lazy(() => import('./features/notes/NotesPage'))
const ReviewHomePage = lazy(() => import('./features/review/ReviewHomePage'))
const ReviewPage = lazy(() => import('./features/review/ReviewPage'))
const ReviewSetPage = lazy(() => import('./features/review/ReviewSetPage'))
const RunPage = lazy(() => import('./features/review/RunPage'))
const AboutSettings = lazy(() => import('./features/settings/AboutSettings'))
const AccountSettings = lazy(() => import('./features/settings/AccountSettings'))
const AppearanceSettings = lazy(() => import('./features/settings/AppearanceSettings'))
const PreferencesSettings = lazy(() => import('./features/settings/PreferencesSettings'))
const DataSettings = lazy(() => import('./features/settings/DataSettings'))
const SessionsSettings = lazy(() => import('./features/settings/SessionsSettings'))
const SettingsLayout = lazy(() => import('./features/settings/SettingsLayout'))
const TimerPage = lazy(() => import('./features/timer/TimerPage'))

/** A chunk that is still arriving, where a whole page will be. */
function PageChunk({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <Loading />
        </main>
      }
    >
      {children}
    </Suspense>
  )
}

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
  if (location.pathname === '/verify')
    return (
      <PageChunk>
        <VerifyPage />
      </PageChunk>
    )
  if (location.pathname === '/reset-password')
    return (
      <PageChunk>
        <ResetPasswordPage />
      </PageChunk>
    )

  /*
   * The two documents, reachable in every authentication state and outside the
   * app shell. The moments someone wants them are before signing up and after
   * deciding to leave, and neither is a moment they are inside the app.
   */
  if (location.pathname === '/privacy')
    return (
      <PageChunk>
        <PrivacyPage />
      </PageChunk>
    )
  if (location.pathname === '/terms')
    return (
      <PageChunk>
        <TermsPage />
      </PageChunk>
    )

  if (!user) {
    return (
      <PageChunk>
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
      </PageChunk>
    )
  }

  /*
   * Signed in, but the address is not confirmed.
   *
   * Every data route answers 403 for this account (07 L3), so rendering the app
   * shell would produce a screen of failed panels that reads as a bug. This is
   * the one state where the whole app is replaced by an explanation.
   */
  if (!user.emailVerified)
    return (
      <PageChunk>
        <VerifyPendingPage email={user.email} />
      </PageChunk>
    )

  return (
    // The shell and the timer are chunks too, so the whole signed-in tree
    // needs a boundary above it. Left unindented, like the two wrappers
    // inside it, so this file's route table stays diffable.
    <PageChunk>
    <TimerProvider>
      <PeekProvider
        peekedPath={background ? location.pathname : null}
        background={background}
      >
        <AppShell user={user}>
          {/*
            Inside the shell, so a screen that throws leaves the sidebar, the
            nav and the timer standing and the way out is a click. It clears
            itself when the path changes, which is what makes that click work
            (F-03, components/error-boundary.tsx).
          */}
          <RouteErrorBoundary>
          {/*
            The screen's chunk, arriving. Inside the boundary and inside the
            shell, so a slow network shows a spinner where the page goes and
            leaves the nav to do what it always does — and outside `<Routes>`,
            so opening a peek over a list does not remount the route it is
            peeking from.
          */}
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <Loading />
              </div>
            }
          >
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
              <Route path="/settings/preferensi" element={<PreferencesSettings />} />
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
          </Suspense>
          </RouteErrorBoundary>
        </AppShell>
      </PeekProvider>
    </TimerProvider>
    </PageChunk>
  )
}
