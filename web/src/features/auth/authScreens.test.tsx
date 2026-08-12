import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ForgotPasswordPage from './ForgotPasswordPage'
import LoginPage from './LoginPage'
import ResetPasswordPage from './ResetPasswordPage'
import SignupPage from './SignupPage'
import VerifyPage from './VerifyPage'
import VerifyPendingPage from './VerifyPendingPage'

// The signed-out screens (07 L3).
//
// These are the only screens a stranger sees, and two of them have a property
// that is easy to break by making the copy friendlier: signup and resend both
// answer 204 regardless of whether the address exists, so neither screen may
// claim that an account was created or that a message was actually sent.

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderAt(ui: ReactNode, path = '/', qc = newClient()) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function apiError(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status)
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Filling in the signup form, all of it.
//
// A helper rather than four lines per test: the form gained first name and a
// confirm field, and every test that is not *about* validation wants "a
// filled-in form that would succeed". Spelling that out per test is how one of
// them gets left behind on the next change.
async function fillSignup(overrides: Partial<Record<string, string>> = {}) {
  const values: Record<string, string> = {
    'Nama depan': 'Sena',
    Email: 'murid@example.com',
    'Kata sandi': 'kalimat-yang-panjang',
    'Ulangi kata sandi': 'kalimat-yang-panjang',
    ...overrides,
  }
  for (const [label, value] of Object.entries(values)) {
    if (!value) continue
    await userEvent.type(screen.getByLabelText(label), value)
  }
}

describe('SignupPage', () => {
  it('confirms that a link was sent, never that an account was created', async () => {
    // The server answers 204 for an address that is already registered, so a
    // success here does not mean a new account exists. Copy that says "akun
    // dibuat" would turn this screen into the account-existence oracle the API
    // deliberately is not (D-039).
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    renderAt(<SignupPage />)

    await fillSignup()
    await userEvent.click(screen.getByRole('button', { name: 'Buat akun' }))

    const heading = await screen.findByRole('heading', { name: 'Cek email kamu' })
    expect(heading).toBeInTheDocument()
    expect(screen.getByText(/murid@example.com/)).toBeInTheDocument()

    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/akun kamu (sudah )?dibuat/i)
    expect(body).not.toMatch(/berhasil (mendaftar|dibuat)/i)
  })

  it('states the password rule before it can be broken', async () => {
    // A rule you only learn by breaking it is a rule that annoys. It is on the
    // form, not only in the error the server would return.
    renderAt(<SignupPage />)
    expect(screen.getByText(/minimal 12 karakter/i)).toBeInTheDocument()
  })

  it('shows the server message when signup is refused', async () => {
    fetchMock.mockResolvedValue(
      apiError('bad_request', 'Alamat email tidak valid.', 400),
    )

    renderAt(<SignupPage />)

    await fillSignup({ Email: 'a@b.co' })
    await userEvent.click(screen.getByRole('button', { name: 'Buat akun' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Alamat email tidak valid.')
  })
})

describe('VerifyPage', () => {
  it('spends the token exactly once, even under StrictMode', async () => {
    // StrictMode double-invokes effects in development. Without the guard the
    // second call finds the token already spent and renders the failure screen
    // over a verification that actually worked — a bug that only ever appears
    // in dev, which is the worst place for one to hide.
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    render(
      <StrictMode>
        <QueryClientProvider client={newClient()}>
          <MemoryRouter initialEntries={['/verify?token=tok-1']}>
            <VerifyPage />
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    )

    await screen.findByRole('heading', { name: 'Email terverifikasi' })

    const verifyCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/verify'))
    expect(verifyCalls).toHaveLength(1)
  })

  it('sends the token from the query string', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    renderAt(<VerifyPage />, '/verify?token=tok-abc')

    await screen.findByRole('heading', { name: 'Email terverifikasi' })
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init.body))).toEqual({ token: 'tok-abc' })
  })

  it('offers a way forward when the link is not valid', async () => {
    // Expired, spent and forged are one answer from the server on purpose, so
    // the screen cannot explain which happened — it offers the route out.
    fetchMock.mockResolvedValue(
      apiError('invalid_token', 'Tautan verifikasi tidak berlaku lagi. Minta tautan baru ya.', 400),
    )

    renderAt(<VerifyPage />, '/verify?token=stale')

    await screen.findByRole('heading', { name: 'Tautan tidak berlaku' })
    expect(screen.getByRole('link', { name: /masuk/i })).toBeInTheDocument()
  })

  it('does not call the API at all without a token', async () => {
    renderAt(<VerifyPage />, '/verify')

    await screen.findByRole('heading', { name: 'Tautan tidak berlaku' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('VerifyPendingPage', () => {
  it('resends without claiming a message definitely went out', async () => {
    // The endpoint answers 204 for an unknown or already-verified address too,
    // so this screen must not report more than the response carries.
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    renderAt(<VerifyPendingPage email="murid@example.com" />)

    await userEvent.click(screen.getByRole('button', { name: 'Kirim ulang tautan' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/kalau/i)

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/auth/resend-verification')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'murid@example.com' })
  })

  it('offers a way out of the state', async () => {
    // Without a sign-out the only escape from an unverifiable account is
    // clearing cookies by hand.
    renderAt(<VerifyPendingPage email="murid@example.com" />)
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument()
  })

  it('is not punitive', async () => {
    // Hard rule 6. Waiting on an email is not the user's fault and the copy
    // does not imply it is.
    renderAt(<VerifyPendingPage email="murid@example.com" />)
    const body = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['gagal', 'tidak diizinkan', 'ditolak', 'kesalahan kamu']) {
      expect(body).not.toContain(banned)
    }
  })
})

describe('ForgotPasswordPage', () => {
  it('never claims the address is registered', async () => {
    // The endpoint answers 204 either way, because one that answered
    // differently would be a way to test who uses this app (D-039, D-066).
    // The copy has to be conditional or the screen leaks what the API does not.
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    renderAt(<ForgotPasswordPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'murid@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Kirim tautan' }))

    await screen.findByRole('heading', { name: 'Cek email kamu' })

    const body = document.body.textContent ?? ''
    expect(body).toMatch(/kalau/i)
    expect(body).not.toMatch(/kami sudah mengirim tautan ke murid@example\.com\./i)
  })
})

describe('ResetPasswordPage', () => {
  it('spends the token only on submit, never on mount', async () => {
    // A mail scanner following the URL must not burn the link before the
    // person gets to it. Nothing happens until a password is submitted.
    renderAt(<ResetPasswordPage />, '/reset-password?token=tok-1')

    await screen.findByRole('heading', { name: 'Buat kata sandi baru' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the token from the query string with the new password', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    renderAt(<ResetPasswordPage />, '/reset-password?token=tok-abc')

    await userEvent.type(screen.getByLabelText('Kata sandi baru'), 'kalimat-yang-panjang')
    await userEvent.type(
      screen.getByLabelText('Ulangi kata sandi baru'),
      'kalimat-yang-panjang',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Simpan kata sandi' }))

    await screen.findByRole('heading', { name: 'Kata sandi diperbarui' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/auth/reset')
    expect(JSON.parse(String(init.body))).toEqual({
      token: 'tok-abc',
      password: 'kalimat-yang-panjang',
    })
  })

  it('says the other devices were signed out', async () => {
    // Being signed out everywhere is the feature, not a side effect, so the
    // screen explains it rather than leaving the user to discover it.
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    renderAt(<ResetPasswordPage />, '/reset-password?token=tok-abc')

    await userEvent.type(screen.getByLabelText('Kata sandi baru'), 'kalimat-yang-panjang')
    await userEvent.type(
      screen.getByLabelText('Ulangi kata sandi baru'),
      'kalimat-yang-panjang',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Simpan kata sandi' }))

    await screen.findByRole('heading', { name: 'Kata sandi diperbarui' })
    expect(document.body.textContent ?? '').toMatch(/dikeluarkan/i)
  })

  it('offers a fresh link when the token is rejected', async () => {
    fetchMock.mockResolvedValue(
      apiError('invalid_token', 'Tautan ini tidak berlaku lagi. Minta tautan baru ya.', 400),
    )

    renderAt(<ResetPasswordPage />, '/reset-password?token=stale')

    await userEvent.type(screen.getByLabelText('Kata sandi baru'), 'kalimat-yang-panjang')
    await userEvent.type(
      screen.getByLabelText('Ulangi kata sandi baru'),
      'kalimat-yang-panjang',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Simpan kata sandi' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Tautan ini tidak berlaku lagi.')
  })

  it('does not show a form at all without a token', async () => {
    renderAt(<ResetPasswordPage />, '/reset-password')

    await screen.findByRole('heading', { name: 'Tautan tidak berlaku' })
    expect(screen.queryByLabelText('Kata sandi baru')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Minta tautan baru' })).toBeInTheDocument()
  })
})

describe('LoginPage', () => {
  it('always offers password recovery, even where signup is closed', async () => {
    // Recovery is not a registration feature: a closed instance still has
    // accounts, and they still have people who forget passwords (07 L4).
    fetchMock.mockResolvedValue(jsonResponse({ allowSignup: false }))

    renderAt(<LoginPage />)

    expect(
      await screen.findByRole('link', { name: 'Lupa kata sandi?' }),
    ).toBeInTheDocument()
  })

  it('hides the signup link where signup is closed', async () => {
    // ALLOW_SIGNUP is off by default (D-039), and a link that 404s is worse
    // than no link.
    fetchMock.mockResolvedValue(jsonResponse({ allowSignup: false }))

    renderAt(<LoginPage />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: 'Buat akun' })).not.toBeInTheDocument()
  })

  it('shows it where signup is open', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ allowSignup: true }))

    renderAt(<LoginPage />)

    expect(await screen.findByRole('link', { name: 'Buat akun' })).toBeInTheDocument()
  })
})
