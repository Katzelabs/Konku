import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  </StrictMode>,
)
