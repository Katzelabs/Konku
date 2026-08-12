import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteAccount } from './DeleteAccount'

// Account deletion (07 L7).

function renderDelete() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return render(<DeleteAccount />, { wrapper })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: /Hapus akun$/ }))
}

describe('DeleteAccount', () => {
  it('offers the export inside the confirmation', async () => {
    // Someone who has decided to leave will not go hunting for the export
    // first. The one moment they might still want it is the moment before it
    // is gone, so it is offered there (07 L7 depends on L6 for this reason).
    await openDialogIn(renderDelete)

    const download = screen.getByRole('link', { name: /Unduh/ })
    expect(download).toHaveAttribute('href', '/api/export')
    expect(download).toHaveAttribute('download')
  })

  it('sends the password and nothing else', async () => {
    await openDialogIn(renderDelete)

    await userEvent.type(screen.getByLabelText(/kata sandi/i), 'kalimat-yang-panjang')
    await userEvent.click(screen.getByRole('button', { name: 'Hapus akun saya' }))

    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(call).toBeDefined()
    expect(String(call?.[0])).toBe('/api/account')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ password: 'kalimat-yang-panjang' })
  })

  it('does nothing without a password', async () => {
    // The field is required, so the form does not submit and the request is
    // never made — a delete that fires on an empty confirmation is not a
    // confirmation.
    await openDialogIn(renderDelete)

    await userEvent.click(screen.getByRole('button', { name: 'Hapus akun saya' }))
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'DELETE')).toHaveLength(0)
  })

  it('surfaces a refused password instead of pretending it worked', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'unauthorized', message: 'Kata sandi salah. Akun kamu tidak jadi dihapus.' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await openDialogIn(renderDelete)
    await userEvent.type(screen.getByLabelText(/kata sandi/i), 'salah')
    await userEvent.click(screen.getByRole('button', { name: 'Hapus akun saya' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Kata sandi salah')
  })

  it('states permanence without guilt', async () => {
    // Hard rule 6 holds here too. The honest thing is to say plainly that this
    // cannot be undone — not to make somebody feel bad for leaving.
    await openDialogIn(renderDelete)

    const body = (document.body.textContent ?? '').toLowerCase()
    expect(body).toContain('tidak bisa dibatalkan')
    for (const banned of ['yakin?', 'sayang', 'kehilangan semua', 'jangan pergi']) {
      expect(body).not.toContain(banned)
    }
  })
})

async function openDialogIn(renderFn: () => unknown) {
  renderFn()
  await openDialog()
  await screen.findByRole('dialog')
}
