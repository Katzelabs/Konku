import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../../App'

/*
 * Logging out has to land on the login screen.
 *
 * This is deliberately the whole app rather than the hook. The hook's own test
 * asserts the cache is emptied, and it passed throughout the bug — because the
 * screen does not read the cache, it reads a mounted observer, and what broke
 * was the path between the two. A test one layer below the symptom is a test
 * that agrees with the symptom.
 */

const user = {
  id: 'u-1',
  email: 'a@example.com',
  firstName: 'Sena',
  lastName: 'Prawira',
  emailVerified: true,
}

let signedIn = true
let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  signedIn = true
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/auth/logout')) {
      // The server drops the session. Everything after this is signed out,
      // which is what makes the assertion below about the client and not
      // about the mock.
      signedIn = false
      return new Response(null, { status: 204 })
    }
    if (url.endsWith('/auth/me')) {
      return signedIn
        ? json(user)
        : json({ error: { code: 'unauthorized', message: 'Kamu belum masuk.' } }, 401)
    }
    if (url.endsWith('/auth/config')) return json({ allowSignup: true })
    if (!signedIn) {
      return json({ error: { code: 'unauthorized', message: 'Kamu belum masuk.' } }, 401)
    }
    if (url.includes('/review/due')) return json({ total: 0, cards: [] })
    void init
    return json([])
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderApp() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={['/home']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function signOut(person: ReturnType<typeof userEvent.setup>) {
  // Signed in: the account menu is there to open.
  const account = await screen.findByRole('button', { name: 'Akun' })
  await person.click(account)
  await person.click(await screen.findByRole('menuitem', { name: /keluar/i }))
}

it('lands on the login screen after signing out, with no reload', async () => {
  const person = userEvent.setup()
  renderApp()

  await signOut(person)

  // The login form, reached by the app re-rendering itself. A reload is not
  // available to the user as a fix — they have to know to press it.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeInTheDocument(),
  )
})

it('takes the account out of localStorage on the way, and leaves the theme', async () => {
  // The query cache was the only thing signing out emptied, so a shared
  // browser carried the previous account's timer and preferences into the
  // next one (F-10). Asserted through the real path rather than against
  // clearAccountStorage, because what broke before was the wiring.
  localStorage.setItem('konku.timer', '{"running":true}')
  localStorage.setItem('konku:notes-view', 'grid')
  localStorage.setItem('konku.theme', 'dark')

  const person = userEvent.setup()
  renderApp()

  await signOut(person)

  await waitFor(() => expect(localStorage.getItem('konku.timer')).toBeNull())
  expect(localStorage.getItem('konku:notes-view')).toBeNull()
  expect(localStorage.getItem('konku.theme')).toBe('dark')
})
