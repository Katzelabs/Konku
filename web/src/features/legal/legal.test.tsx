import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import PrivacyPage from './PrivacyPage'
import TermsPage from './TermsPage'

// The policy and the terms (07 L9).
//
// L9's acceptance is that "someone who has not seen the code could read the
// privacy policy and describe what the app stores". That is a claim about
// coverage, so the test is a coverage check: every category of data the
// application actually keeps has to be named on the page.
//
// This is the test that fails when a feature starts storing something new and
// nobody updates the policy — which is the way a privacy policy normally
// becomes untrue.

function renderPage(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

function text() {
  return (document.body.textContent ?? '').toLowerCase()
}

describe('PrivacyPage', () => {
  it('names every category of data the app stores', () => {
    renderPage(<PrivacyPage />)
    const body = text()

    for (const [what, needle] of [
      ['email address', 'alamat email'],
      ['password hash', 'argon2id'],
      ['notes', 'catatan'],
      ['cards', 'kartu'],
      ['categories', 'kategori'],
      ['domains', 'domain'],
      ['review history', 'riwayat'],
      ['focus sessions', 'sesi fokus'],
      ['exams', 'ujian'],
      ['login sessions', 'sesi login'],
      ['IP address', 'alamat ip'],
      ['browser identity', 'browser'],
      ['settings', 'pengaturan'],
    ] as const) {
      expect(body, `the policy does not mention ${what}`).toContain(needle)
    }
  })

  it('names the third parties that receive anything', () => {
    // "Shared with nobody" is not literally true, and saying it would be the
    // boilerplate problem in reverse. Each processor is named with what it
    // actually receives.
    renderPage(<PrivacyPage />)
    const body = text()

    expect(body).toContain('resend')
    expect(body).toContain('sentry')
    // And the limit on what Sentry gets, which is the part that matters.
    expect(body).toContain('id akun')
  })

  it('states retention, including for backups', () => {
    renderPage(<PrivacyPage />)
    const body = text()

    expect(body).toContain('30 hari')
    expect(body).toContain('backup')
  })

  it('states the rights the app actually implements', () => {
    // Export and deletion are built (L6, L7), so the policy can promise them
    // without qualification — and must, since a policy that omits a right the
    // product has is as wrong as one that invents a right it does not.
    renderPage(<PrivacyPage />)
    const body = text()

    expect(body).toContain('unduh')
    expect(body).toContain('hapus akun')
  })

  it('does not claim things the product does not do', () => {
    renderPage(<PrivacyPage />)
    const body = text()

    // No analytics, no ad trackers, no cross-account aggregation (D-066), and
    // no "we take your privacy seriously" — the phrase that means nothing.
    expect(body).toContain('tidak ada analytics')
    expect(body).not.toContain('kami sangat menjaga')
    expect(body).not.toContain('mitra terpercaya')
  })
})

describe('TermsPage', () => {
  it('is honest about there being no uptime guarantee', () => {
    renderPage(<TermsPage />)
    const body = text()

    expect(body).toContain('apa adanya')
    expect(body).toContain('tanpa jaminan')
  })

  it('promises notice and an export window if the service closes', () => {
    // The most basic promise this product can make, and the one its whole
    // thesis rests on: nothing disappears without warning.
    renderPage(<TermsPage />)
    expect(text()).toContain('30 hari')
    expect(screen.getByText(/minimal 30 hari/i)).toBeInTheDocument()
  })

  it('says the content belongs to the user', () => {
    renderPage(<TermsPage />)
    expect(text()).toContain('milik kamu')
  })
})
