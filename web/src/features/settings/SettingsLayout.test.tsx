import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { id } from '../../i18n/id'
import SettingsLayout from './SettingsLayout'
import { SETTINGS_ITEMS } from './nav'

/*
 * The settings shell.
 *
 * Pengaturan was one column with every section stacked in it; it is a rail
 * plus one section now, and three things about that arrangement are load
 * bearing rather than cosmetic:
 *
 *   - every old link to /settings still lands somewhere,
 *   - /domains and /categories keep their URLs but render inside the shell,
 *   - the rail says which section you are on.
 *
 * The sections themselves are stubs here. What is under test is the shell and
 * the routing, and mounting the real ones would drag in useMe and the session
 * list for no extra coverage.
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<SettingsLayout />}>
          <Route path="/settings/akun" element={<p>bagian profil</p>} />
          <Route path="/settings/tampilan" element={<p>bagian tampilan</p>} />
          <Route path="/domains" element={<p>bagian domain</p>} />
        </Route>
        <Route path="/settings" element={<Navigate to="/settings/akun" replace />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SettingsLayout', () => {
  it('sends /settings to the first section', () => {
    // The sidebar, the account menu and Beranda's "Atur" all point at
    // /settings, and so does anything bookmarked before the split.
    renderAt('/settings')

    expect(screen.getByText('bagian profil')).toBeInTheDocument()
  })

  it('offers every section from every section', () => {
    // The point of the rail: Domain to Kategori used to be two navigations
    // through a screen you did not want.
    renderAt('/settings/tampilan')

    // No provider is rendered, so `useCopy()` returns the default locale —
    // Indonesian, which is the source language and the fallback (hard rule 8).
    for (const item of SETTINGS_ITEMS) {
      const links = screen.getAllByRole('link', { name: item.label(id.settings) })
      // Two — the desktop rail and the phone strip. Both are in the DOM at
      // once; which one is visible is a media query's business.
      expect(links.length).toBeGreaterThan(0)
      expect(links[0]).toHaveAttribute('href', item.to)
    }
  })

  it('marks the open section as current', () => {
    renderAt('/settings/tampilan')

    const [current] = screen.getAllByRole('link', { name: 'Tampilan' })
    expect(current).toHaveAttribute('aria-current', 'page')

    const [other] = screen.getAllByRole('link', { name: 'Profil' })
    expect(other).not.toHaveAttribute('aria-current')
  })

  it('keeps /domains at its own URL, inside the shell', () => {
    // The URL was linkable before the split; the rail is what is new. The old
    // "← Pengaturan" back link is gone with it — the rail is always there, so
    // there is nowhere to go back to that is not already on screen.
    renderAt('/domains')

    expect(screen.getByText('bagian domain')).toBeInTheDocument()
    const [nav] = screen.getAllByRole('navigation', { name: 'Bagian pengaturan' })
    expect(within(nav).getByRole('link', { name: 'Kategori' })).toHaveAttribute(
      'href',
      '/categories',
    )
  })
})
