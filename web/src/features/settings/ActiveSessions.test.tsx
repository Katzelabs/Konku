import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActiveSessions } from './ActiveSessions'

// The active sessions screen (07 L5).

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'

const SESSIONS = [
  {
    id: 'pub-1',
    current: true,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    userAgent: CHROME_MAC,
    ip: '203.0.113.10',
  },
  {
    id: 'pub-2',
    current: false,
    createdAt: new Date().toISOString(),
    lastSeen: new Date(Date.now() - 3 * 3600_000).toISOString(),
    userAgent: SAFARI_IOS,
    ip: '203.0.113.99',
  },
]

function renderSessions(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return render(<ActiveSessions />, { wrapper })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(SESSIONS), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ActiveSessions', () => {
  it('names each device and marks the current one', async () => {
    renderSessions()

    expect(await screen.findByText(/Chrome di macOS/)).toBeInTheDocument()
    expect(screen.getByText(/Safari di iOS/)).toBeInTheDocument()
    // Exact, not a substring: "Sesi di perangkat ini tetap aktif" below the
    // list would match a looser pattern and the assertion would pass without
    // the current row ever being labelled.
    expect(screen.getByText('(perangkat ini)')).toBeInTheDocument()
    expect(screen.getByText(/203\.0\.113\.99/)).toBeInTheDocument()
  })

  it('revokes by the public handle, never by a session id', async () => {
    // The API never sends the session id (D-039), so the only thing the client
    // can address a session by is the public handle it was given.
    renderSessions()

    await screen.findByText(/Safari di iOS/)
    await userEvent.click(screen.getByRole('button', { name: 'Akhiri' }))

    const del = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(del).toBeDefined()
    expect(String(del?.[0])).toBe('/api/auth/sessions/pub-2')
  })

  it('offers "sign out elsewhere" when there is an elsewhere', async () => {
    renderSessions()
    expect(await screen.findByRole('button', { name: /Keluarkan/ })).toBeInTheDocument()
  })

  it('hides it when this is the only session', async () => {
    // A button that promises to sign out other devices, with no other devices,
    // is a control that cannot do anything.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([SESSIONS[0]]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    renderSessions()

    await screen.findByText(/Chrome di macOS/)
    expect(screen.queryByRole('button', { name: /Keluarkan/ })).not.toBeInTheDocument()
  })

  it('is not alarming', async () => {
    // Hard rule 6. A list of your own devices is not a security warning, and
    // copy that treats it as one makes an ordinary second browser frightening.
    renderSessions()

    await screen.findByText(/Chrome di macOS/)
    const body = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['tidak dikenali', 'mencurigakan', 'peringatan', 'bahaya']) {
      expect(body).not.toContain(banned)
    }
  })
})
