import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { AppLocale } from './AppLocale'
import { loadCatalog, useLocale } from './index'

/*
 * Resolution: account setting → browser → id (ticket 11 I2, D-094).
 *
 * The failure this file is really about is the one that has no test until
 * somebody writes it: a resolution step that quietly does nothing. An account
 * setting that never reaches the provider, or a `rememberLocale` that is never
 * called, both leave a *working* app — just one in the wrong language, for a
 * while, which nobody files a bug about.
 */

function Reads() {
  return <p data-testid="locale">{useLocale()}</p>
}

/** Renders the tree with `/auth/me` answering `me`. */
function renderWith(me: unknown) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/auth/me')) {
      if (me === null) return new Response('{}', { status: 401 })
      return new Response(JSON.stringify(me), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  })

  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AppLocale>
        <Reads />
      </AppLocale>
    </QueryClientProvider>,
  )
}

const account = {
  id: 'u-1',
  email: 'a@example.com',
  firstName: 'Sena',
  lastName: '',
  emailVerified: true,
  locale: null as string | null,
}

/** jsdom reports an English navigator; every case that is not about the browser states it. */
function browserAsks(tags: string[]) {
  Object.defineProperty(navigator, 'languages', { configurable: true, get: () => tags })
}

// What `main.tsx` does before `createRoot`: the boot locale's catalog is in
// memory before anything mounts, so the *first* render is already in the right
// language. `LocaleProvider` deliberately will not switch to a locale whose
// chunk has not arrived, so without this the synchronous assertions below
// would be testing the loader rather than resolution.
beforeAll(async () => {
  await loadCatalog('en')
})

beforeEach(() => {
  browserAsks(['id-ID'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('follows the browser when the account has never chosen', async () => {
  browserAsks(['en-US', 'en'])
  renderWith({ ...account, locale: null })

  // Not "eventually en" — `bootLocale()` answered before anything mounted, so
  // English is what the very first render already shows. Awaiting a change
  // here would pass even if the answer arrived after a paint, which is the
  // whole bug (D-086).
  expect(screen.getByTestId('locale')).toHaveTextContent('en')
})

it('lets the account setting outrank the browser', async () => {
  browserAsks(['id-ID'])
  renderWith({ ...account, locale: 'en' })

  // This one *is* a wait: the setting arrives over the network, and the
  // provider holds the language it has until the English catalog lands.
  await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('en'))
})

it('falls back to Indonesian when neither has an answer', async () => {
  browserAsks(['pt-BR'])
  renderWith(null)

  expect(screen.getByTestId('locale')).toHaveTextContent('id')
})

it('remembers the resolved locale for the next boot', async () => {
  browserAsks(['id-ID'])
  renderWith({ ...account, locale: 'en' })

  // The half that is easiest to omit and hardest to notice: without it every
  // reload paints Indonesian and flips to English once the account loads.
  await waitFor(() => expect(localStorage.getItem('konku.locale')).toBe('en'))
})

it('ignores a locale the API answers with that this build has no copy for', async () => {
  browserAsks(['id-ID'])
  renderWith({ ...account, locale: 'pt-BR' })

  // An API response is not a place to trust a string. A locale with no catalog
  // behind it must never reach `copyFor`.
  expect(screen.getByTestId('locale')).toHaveTextContent('id')
})
