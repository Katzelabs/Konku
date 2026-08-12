import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'
import ResetPasswordPage from './ResetPasswordPage'
import SignupPage from './SignupPage'
import VerifyPendingPage from './VerifyPendingPage'

/*
 * The signed-out forms: validation, the reveal toggle, and the resend wait.
 *
 * Every assertion here is about behaviour a user can observe, not about which
 * library produced it — swapping the schema layer should not touch this file.
 * The one thing it deliberately does NOT test is security: none of these rules
 * protect anything, because a client can skip all of them. `internal/api`'s
 * tests are where that lives. What these protect is the form staying usable.
 */

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderAt(ui: ReactNode, path = '/') {
  return render(
    <QueryClientProvider client={newClient()}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const GOOD = 'kalimat-yang-panjang'

async function fillSignup(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'Nama depan': 'Sena',
    Email: 'murid@example.com',
    'Kata sandi': GOOD,
    'Ulangi kata sandi': GOOD,
    ...overrides,
  }
  for (const [label, value] of Object.entries(values)) {
    if (!value) continue
    await userEvent.type(screen.getByLabelText(label), value)
  }
}

describe('signup validation', () => {
  it('says what is wrong without asking the server', async () => {
    renderAt(<SignupPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Buat akun' }))

    // Every problem at once. One-per-attempt is the pattern that makes a form
    // feel like an interrogation.
    expect(await screen.findByText('Nama depan wajib diisi.')).toBeInTheDocument()
    expect(screen.getByText('Email wajib diisi.')).toBeInTheDocument()
    expect(screen.getByText('Kata sandi wajib diisi.')).toBeInTheDocument()

    // And no request went out. A round trip to be told the form is empty is a
    // round trip that did not need to happen.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('catches a password that does not match its confirmation', async () => {
    renderAt(<SignupPage />)

    await fillSignup({ 'Ulangi kata sandi': 'kalimat-yang-berbeda' })
    await userEvent.click(screen.getByRole('button', { name: 'Buat akun' }))

    // On the confirm field, which is the one to change — not floating above a
    // pair of fields that both look fine.
    expect(await screen.findByText('Kata sandinya belum sama.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears the mismatch when the first field is the one corrected', async () => {
    // The cross-field case that is easy to get wrong: the error sits on
    // `confirmPassword`, and editing `password` is what fixes it. An error
    // that lingers until the *other* field is touched again reads as the form
    // ignoring what you just did.
    renderAt(<SignupPage />)

    await fillSignup({ 'Kata sandi': GOOD + '-typo' })
    await userEvent.click(screen.getByRole('button', { name: 'Buat akun' }))
    expect(await screen.findByText('Kata sandinya belum sama.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Kata sandi'))
    await userEvent.type(screen.getByLabelText('Kata sandi'), GOOD)

    await waitFor(() =>
      expect(screen.queryByText('Kata sandinya belum sama.')).not.toBeInTheDocument(),
    )
  })

  it('stays quiet while a field is being typed for the first time', async () => {
    // "Format email belum benar" at `m`, `mu`, `mur` is noise, and it is wrong
    // every time until the moment it is right.
    renderAt(<SignupPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'mur')

    expect(screen.queryByText(/format email/i)).not.toBeInTheDocument()
  })

  it('checks a field once it has been left', async () => {
    renderAt(<SignupPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'bukan-email')
    await userEvent.tab()

    expect(await screen.findByText(/format email belum benar/i)).toBeInTheDocument()
  })

  it('sends the trimmed values, and an empty last name when it was skipped', async () => {
    renderAt(<SignupPage />)

    await fillSignup({ 'Nama depan': '  Sena  ' })
    await userEvent.click(screen.getByRole('button', { name: 'Buat akun' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init.body))).toEqual({
      firstName: 'Sena',
      // Optional means optional: the form has to be completable without it.
      lastName: '',
      email: 'murid@example.com',
      password: GOOD,
      confirmPassword: GOOD,
    })
  })

  it('ties each message to its own field for a screen reader', async () => {
    renderAt(<SignupPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Buat akun' }))
    await screen.findByText('Nama depan wajib diisi.')

    const input = screen.getByLabelText('Nama depan')
    expect(input).toHaveAttribute('aria-invalid', 'true')

    // The id it points at has to exist, which is the half that silently rots.
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Nama depan wajib diisi.',
    )
  })
})

describe('which fields may be skipped', () => {
  /*
   * The label used to say "(opsional)" and no longer does — it is carried by
   * the placeholder and by `required` on everything else. That split is worth
   * a test precisely because the visible half and the announced half are now
   * different attributes: deleting either one leaves a form that still looks
   * fine to whoever made the change.
   */
  it('marks every required field required, and the last name not', async () => {
    renderAt(<SignupPage />)

    for (const label of ['Nama depan', 'Email', 'Kata sandi', 'Ulangi kata sandi']) {
      expect(screen.getByLabelText(label, { exact: true })).toBeRequired()
    }

    // The one that is not. A placeholder alone would not survive here: it is
    // not reliably announced once a label exists, so this absence is what
    // tells a screen reader the field can be skipped.
    expect(screen.getByLabelText('Nama belakang')).not.toBeRequired()
  })

  it('says so on screen too, where the absence of an attribute is invisible', async () => {
    renderAt(<SignupPage />)

    expect(screen.getByLabelText('Nama belakang')).toHaveAttribute(
      'placeholder',
      'Opsional',
    )
  })

  it('still validates through the schema rather than the browser', async () => {
    // `required` on an input inside a form that is not `noValidate` would hand
    // validation back to the browser: its own bubble, its own language, one
    // field at a time, and no way to say "kata sandinya belum sama". The form
    // carries noValidate for exactly this reason, and adding `required`
    // attributes is the change most likely to quietly undo it.
    renderAt(<SignupPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Buat akun' }))

    expect(await screen.findByText('Nama depan wajib diisi.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('password reveal', () => {
  it('starts hidden and toggles', async () => {
    renderAt(<LoginPage />)

    const input = screen.getByLabelText('Kata sandi')
    // Hidden first, always: shoulder-surfing is the reason the dots exist.
    expect(input).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Tampilkan kata sandi' }))
    expect(input).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Sembunyikan kata sandi' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('reveals one field at a time', async () => {
    // Two password fields on one screen are two independent decisions. A
    // single shared toggle would reveal the confirm field on a screen where
    // the person only wanted to check the one they were typing.
    renderAt(<ResetPasswordPage />, '/reset-password?token=tok-1')

    const first = screen.getByLabelText('Kata sandi baru')
    const second = screen.getByLabelText('Ulangi kata sandi baru')

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Tampilkan kata sandi' })[0],
    )

    expect(first).toHaveAttribute('type', 'text')
    expect(second).toHaveAttribute('type', 'password')
  })

  it('is not a stop on the way to the submit button', async () => {
    // The natural path is field, field, submit. A tab stop between the
    // password and the next field is in the way of everyone who never wants
    // to look at what they typed.
    renderAt(<LoginPage />)

    expect(screen.getByRole('button', { name: 'Tampilkan kata sandi' })).toHaveAttribute(
      'tabindex',
      '-1',
    )
  })
})

describe('resend cooldown', () => {
  async function signUp(email: string) {
    renderAt(<SignupPage />)
    await fillSignup({ Email: email })
    await userEvent.click(screen.getByRole('button', { name: 'Buat akun' }))
    return screen.findByRole('button', { name: /kirim ulang/i })
  }

  it('starts waiting after a signup, which did send a message', async () => {
    const button = await signUp('murid@example.com')

    expect(button).toBeDisabled()
    // The countdown is in the button's own label, so a disabled control always
    // says why. A greyed-out button with no explanation is the version of this
    // that gets clicked repeatedly and reported as broken.
    expect(button).toHaveTextContent(/dalam \d+ detik/)
  })

  it('does not impose a wait on a screen that sent nothing', async () => {
    // Signing in to an unverified account lands here and sends no mail. A
    // wait here would be sixty seconds charged for a message that never
    // existed, on the one button that unsticks the account.
    renderAt(<VerifyPendingPage email="belum@example.com" />)

    expect(
      await screen.findByRole('button', { name: 'Kirim ulang tautan' }),
    ).toBeEnabled()
  })

  it('announces the remaining time, not only the disabled state', async () => {
    await signUp('murid@example.com')

    expect(
      await screen.findByText(/bisa kirim ulang dalam \d+ detik/i),
    ).toBeInTheDocument()
  })

  it('survives a reload', async () => {
    // The deadline is persisted, not the remaining seconds. A counter held in
    // state resets on reload — and reloading is exactly what someone does
    // after clicking the link in the mail, which would turn the limit into a
    // suggestion.
    const { unmount } = renderAt(<VerifyPendingPage email="murid@example.com" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Kirim ulang tautan' }))
    await screen.findByRole('button', { name: /kirim ulang dalam/i })
    unmount()

    renderAt(<VerifyPendingPage email="murid@example.com" />)
    expect(
      await screen.findByRole('button', { name: /kirim ulang dalam/i }),
    ).toBeDisabled()
  })

  it('does not inherit another account\u2019s wait', async () => {
    const { unmount } = renderAt(<VerifyPendingPage email="satu@example.com" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Kirim ulang tautan' }))
    await screen.findByRole('button', { name: /kirim ulang dalam/i })
    unmount()

    renderAt(<VerifyPendingPage email="dua@example.com" />)
    expect(
      await screen.findByRole('button', { name: 'Kirim ulang tautan' }),
    ).toBeEnabled()
  })

  it('sends exactly one message per press', async () => {
    // The wait starts on the press, not on the response. Starting it in
    // onSuccess would leave the button live during the request, and two quick
    // clicks would be two messages.
    renderAt(<VerifyPendingPage email="dua@example.com" />)

    const button = await screen.findByRole('button', { name: 'Kirim ulang tautan' })
    await userEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())

    const resends = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/auth/resend-verification'),
    )
    expect(resends).toHaveLength(1)
  })
})
