import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { TimerProvider } from '../../features/timer/TimerProvider'

/*
 * The keyboard route into the page.
 *
 * The shell renders the same sidebar, top bar and bottom nav on every screen,
 * and they all sit before the only part that changed. Without a skip link,
 * arriving anywhere by keyboard means tabbing through the whole navigation
 * again (F-12).
 */

const user = {
  id: 'u-1',
  email: 'a@example.com',
  firstName: 'Sena',
  lastName: 'Prawira',
  emailVerified: true,
  // Never chosen a language, which is what a real account starts as (00014).
  locale: null,
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ total: 0, cards: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderShell() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/home']}>
        {/* The focus pill in the top bar reads it, so the shell does not
            render without one. */}
        <TimerProvider>
          <AppShell user={user}>
            <p>Isi halaman</p>
          </AppShell>
        </TimerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

it('offers a skip link that points at the content', () => {
  const { container } = renderShell()

  const skip = screen.getByRole('link', { name: 'Lewati ke konten' })
  expect(skip).toHaveAttribute('href', '#konten')

  const main = container.querySelector('main')
  expect(main).toHaveAttribute('id', 'konten')
  // Focusable by the jump, or the fragment moves the scroll and leaves focus
  // in the sidebar — the next Tab would go straight back to the top of it.
  expect(main).toHaveAttribute('tabindex', '-1')
})

it('puts the skip link before the navigation', () => {
  const { container } = renderShell()

  const skip = screen.getByRole('link', { name: 'Lewati ke konten' })
  const nav = container.querySelector('nav')

  expect(nav).not.toBeNull()
  // A skip link that is not first is a link you reach by doing the thing it
  // exists to save you from.
  expect(skip.compareDocumentPosition(nav as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
