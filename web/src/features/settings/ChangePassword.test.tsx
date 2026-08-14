import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangePassword } from './ChangePassword'

// Changing the password from inside the app.
//
// Before this the only route to a new password was the forgot-password mail,
// which an instance with no SMTP configured cannot send at all.

const CURRENT = 'kata sandi yang lama'
const NEXT = 'kata sandi yang baru'

function renderChange() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return render(<ChangePassword />, { wrapper })
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
  renderChange()
  await userEvent.click(screen.getByRole('button', { name: /^Ubah$/ }))
  await screen.findByRole('dialog')
}

/** Fill all three fields. Split out because most tests need a valid form. */
async function fill(current: string, next: string, confirm: string) {
  await userEvent.type(screen.getByLabelText('Kata sandi saat ini'), current)
  await userEvent.type(screen.getByLabelText('Kata sandi baru'), next)
  await userEvent.type(screen.getByLabelText('Ulangi kata sandi baru'), confirm)
}

function postCalls() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
}

describe('ChangePassword', () => {
  it('sends both passwords under the names the API expects', async () => {
    await openDialog()
    await fill(CURRENT, NEXT, NEXT)
    await userEvent.click(screen.getByRole('button', { name: 'Simpan kata sandi' }))

    await waitFor(() => expect(postCalls()).toHaveLength(1))
    const [url, init] = postCalls()[0]
    expect(String(url)).toBe('/api/auth/password')
    expect(JSON.parse(String(init?.body))).toEqual({
      currentPassword: CURRENT,
      newPassword: NEXT,
    })
  })

  /*
   * The one this file exists for.
   *
   * A delete dialog once shipped stuck open because nothing asserted that it
   * closed — the mutation succeeded, so nothing looked wrong on the server
   * side, and the only symptom was a dialog sitting over a screen whose work
   * was already done.
   */
  it('closes once the change succeeds', async () => {
    await openDialog()
    await fill(CURRENT, NEXT, NEXT)
    await userEvent.click(screen.getByRole('button', { name: 'Simpan kata sandi' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('stays open and says why when the current password is refused', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'unauthorized',
            message: 'Kata sandi saat ini salah. Kata sandi kamu tidak berubah.',
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await openDialog()
    await fill('salah sekali panjang', NEXT, NEXT)
    await userEvent.click(screen.getByRole('button', { name: 'Simpan kata sandi' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Kata sandi saat ini salah')
    // Still open, because the person has something to correct here. Closing on
    // a failure would discard what they typed and tell them nothing.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('refuses a mismatched confirmation without asking the server', async () => {
    await openDialog()
    await fill(CURRENT, NEXT, 'sesuatu yang lain')
    await userEvent.click(screen.getByRole('button', { name: 'Simpan kata sandi' }))

    expect(await screen.findByText('Kata sandinya belum sama.')).toBeInTheDocument()
    expect(postCalls()).toHaveLength(0)
  })

  it('refuses a new password identical to the current one', async () => {
    // Accepting it as a no-op would leave someone believing they had changed
    // something — and the usual reason they are here is that they think the old
    // one is compromised.
    await openDialog()
    await fill(CURRENT, CURRENT, CURRENT)
    await userEvent.click(screen.getByRole('button', { name: 'Simpan kata sandi' }))

    expect(
      await screen.findByText('Kata sandi baru masih sama dengan yang lama.'),
    ).toBeInTheDocument()
    expect(postCalls()).toHaveLength(0)
  })

  it('refuses a new password shorter than the minimum', async () => {
    await openDialog()
    await fill(CURRENT, 'pendek', 'pendek')
    await userEvent.click(screen.getByRole('button', { name: 'Simpan kata sandi' }))

    expect(await screen.findByText(/minimal 12 karakter/i)).toBeInTheDocument()
    expect(postCalls()).toHaveLength(0)
  })

  it('does not keep the typed passwords after the dialog is dismissed', async () => {
    await openDialog()
    await fill(CURRENT, NEXT, NEXT)
    await userEvent.click(screen.getByRole('button', { name: 'Batal' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^Ubah$/ }))
    await screen.findByRole('dialog')
    expect(screen.getByLabelText('Kata sandi saat ini')).toHaveValue('')
    expect(screen.getByLabelText('Kata sandi baru')).toHaveValue('')
  })

  it('says what happens to the other devices, and is not punitive about it', async () => {
    await openDialog()

    const body = (document.body.textContent ?? '').toLowerCase()
    expect(body).toContain('perangkat lain')
    // Not a destructive action and must not be dressed as one (D-054, rule 6).
    for (const banned of ['yakin?', 'peringatan', 'bahaya', 'tidak bisa dibatalkan']) {
      expect(body).not.toContain(banned)
    }
  })
})
