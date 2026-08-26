import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { AppErrorBoundary } from './components/error-boundary'
import { installGlobalErrorReporting } from './lib/report-error'
import { bootLocale, loadCatalog, LocaleProvider } from './i18n'
import { ThemeProvider } from './features/settings/useTheme'
import './index.css'

// The living style guide at /design. Declared inside the DEV check so that
// `import.meta.env.DEV` folds to `false` in a production build and Rollup drops
// the whole module — it never reaches the embedded binary.
const StyleGuide = import.meta.env.DEV
  ? lazy(() => import('./design/StyleGuide'))
  : null

// TanStack Query owns all server state; useState or a small Zustand store hold
// only genuine client state, which in this app is essentially just the timer
// (D-044).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

// Before the first render, so an error thrown while the tree is still mounting
// has somewhere to go. The two listeners cover what an error boundary cannot
// see: event handlers, timers, and rejected promises (F-03).
installGlobalErrorReporting()

/*
 * The locale of the first paint, decided synchronously, and its copy fetched
 * before anything mounts.
 *
 * English lives in its own chunk so that I5's 551 literals in two languages do
 * not all land in the bundle a signed-out stranger waits on (see the note in
 * i18n/index.tsx). The waiting for it happens exactly here, once, so that
 * `useCopy()` stays synchronous at every one of the hundreds of call sites that
 * are about to be written.
 *
 * Indonesian resolves without a network request — it is statically imported —
 * so the default locale pays nothing for this. English pays one round trip,
 * which buys not flashing Indonesian at an English reader first.
 *
 * `.catch` rather than a bare await: if the chunk does not arrive we still
 * render, in Indonesian, which is the documented fallback (hard rule 8). A
 * missing translation must not be a blank page.
 */
const locale = bootLocale()

loadCatalog(locale)
  .catch(() => {})
  .then(() => {
    createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outermost, so a throw in a provider or on a signed-out screen is a page
        that explains itself rather than a blank one. The router has its own
        boundary inside the shell (App.tsx), which is the one that keeps the
        nav alive when a single screen breaks. */}
    <AppErrorBoundary>
    {/* Outside everything, because the signed-out screens need copy too and a
        401 must not change the language mid-session.

        The prop is the whole seam. It carries `bootLocale()` today, which
        reads a localStorage hint and otherwise answers `id` — the source
        language and the fallback (D-094). Resolution is ticket 11 I2: account
        setting → Accept-Language → id. I2 changes what feeds this prop and
        what `bootLocale()` knows; nothing below this line changes at all. */}
    <LocaleProvider locale={locale}>
    <QueryClientProvider client={queryClient}>
      {/* Outside the router so the theme applies to the login screen too. */}
      <ThemeProvider>
      {/* Real paths, not hashes: the Go server serves the SPA shell for every
          non-/api route, so a deep link like /notes/<id> loads directly. */}
      <BrowserRouter>
        <Routes>
          {StyleGuide && (
            <Route
              path="/design"
              element={
                <Suspense fallback={null}>
                  <StyleGuide />
                </Suspense>
              }
            />
          )}
          {/* App owns its own <Routes> for everything else. */}
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
    </LocaleProvider>
    </AppErrorBoundary>
  </StrictMode>,
    )
  })
