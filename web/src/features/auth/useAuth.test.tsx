import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogout, useMe } from './useAuth'

// A 401 from /auth/me is a normal answer — "not signed in" — not an error.
// Letting it surface as an error makes the app flash a failure state on every
// cold load for a logged-out visitor, which is the first thing a new user sees.

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

function newClient() {
  return new QueryClient({
    // No gcTime override here: a query with no observers and gcTime 0 is
    // collected the instant it is written, so the cache assertions below
    // would fail on the harness rather than on the app.
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMe', () => {
  it('treats a 401 as signed out, not as an error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Belum masuk.' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { result } = renderHook(() => useMe(), { wrapper: wrapper(newClient()) })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.isError).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('still surfaces a real failure as an error', async () => {
    // A 500 is not "signed out". Swallowing it too would hide an outage
    // behind a login screen.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'internal', message: 'Kesalahan.' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { result } = renderHook(() => useMe(), { wrapper: wrapper(newClient()) })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.isError).toBe(true)
  })

  it('returns the user when signed in', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'u-1', email: 'a@example.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { result } = renderHook(() => useMe(), { wrapper: wrapper(newClient()) })

    await waitFor(() => expect(result.current.data).not.toBeUndefined())
    expect(result.current.data).toEqual({ id: 'u-1', email: 'a@example.com' })
  })
})

describe('useLogout', () => {
  // Cached notes and due cards belong to the account that just signed out.
  // Clearing only the user would leave one account's learning history sitting
  // in the cache for the next person to sign in on this device.
  it('clears the whole cache, not just the user', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    const qc = newClient()
    qc.setQueryData(['notes'], ['a note belonging to the outgoing account'])

    const { result } = renderHook(() => useLogout(), { wrapper: wrapper(qc) })

    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(qc.getQueryData(['notes'])).toBeUndefined()
    expect(qc.getQueryData(['auth', 'me'])).toBeNull()
  })
})
