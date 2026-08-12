import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../../api/types'
import CategorySettings from './CategorySettings'

// Category management (D-074).
//
// Categories were the one piece of user vocabulary with no screen behind it:
// created by typing, and then permanent. These assert the repairs — rename,
// recolour, archive — and the one rule the endpoint has that the screen has to
// respect, which is that recolouring is a PATCH and must not have to resend a
// label it never touched.

const CATEGORIES: Category[] = [
  {
    id: 'c-alj',
    slug: 'aljabar',
    label: 'Aljabar',
    color: '#4F7CAC',
    archivedAt: null,
    noteCount: 3,
    cardCount: 7,
  },
  {
    id: 'c-lama',
    slug: 'lama',
    label: 'Sudah lama',
    color: '#5C6B73',
    archivedAt: '2026-01-01T00:00:00Z',
    noteCount: 0,
    cardCount: 0,
  },
]

let fetchMock: ReturnType<typeof vi.fn>

/** Requests the screen actually sent, in order. */
function writes() {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== 'GET')
    .map(([url, init]) => ({
      url: String(url),
      method: String(init?.method),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }))
}

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') {
      return new Response(JSON.stringify(CATEGORIES), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify(CATEGORIES[0]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderSettings() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return render(<CategorySettings />, { wrapper })
}

/** The row for `label`, once the list has loaded. */
async function row(label: string) {
  const name = await screen.findByText(label)
  const li = name.closest('li')
  if (!li) throw new Error(`no row for ${label}`)
  return li
}

describe('CategorySettings', () => {
  it('lists live and archived categories separately', async () => {
    renderSettings()

    expect(await screen.findByText('Aljabar')).toBeInTheDocument()
    expect(screen.getByText('Sudah lama')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Diarsipkan' })).toBeInTheDocument()
  })

  it('shows what a category is attached to', async () => {
    // It is the answer to "can I delete this?", and it is why the delete may
    // come back 409 — showing it turns a refusal into something foreseen.
    renderSettings()

    const alj = await row('Aljabar')
    expect(within(alj).getByText(/3 catatan · 7 kartu/)).toBeInTheDocument()

    const lama = await row('Sudah lama')
    expect(within(lama).getByText('belum dipakai')).toBeInTheDocument()
  })

  it('renames and recolours in one request', async () => {
    renderSettings()

    await userEvent.click(within(await row('Aljabar')).getByRole('button', { name: 'Ubah' }))

    const name = screen.getByLabelText('Nama kategori')
    await userEvent.clear(name)
    await userEvent.type(name, 'Aljabar Linear')
    await userEvent.click(screen.getByRole('button', { name: 'Warna #8E7DBE' }))
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    const patch = writes().find((w) => w.method === 'PATCH')
    expect(patch?.url).toBe('/api/categories/c-alj')
    expect(patch?.body).toEqual({ label: 'Aljabar Linear', color: '#8E7DBE' })
  })

  it('archives without deleting', async () => {
    // Archiving is the normal way to retire one (D-051): it leaves the picker
    // and keeps labelling everything it ever labelled.
    renderSettings()

    await userEvent.click(
      within(await row('Aljabar')).getByRole('button', { name: 'Arsipkan' }),
    )

    const post = writes().find((w) => w.method === 'POST')
    expect(post?.url).toBe('/api/categories/c-alj/archive')
  })

  it('offers to reactivate an archived category, not to edit it', async () => {
    renderSettings()
    const lama = await row('Sudah lama')

    expect(within(lama).getByRole('button', { name: 'Aktifkan lagi' })).toBeInTheDocument()
    expect(within(lama).queryByRole('button', { name: 'Ubah' })).not.toBeInTheDocument()
  })

  it('surfaces the server refusal when a category is still in use', async () => {
    // Deleting one that is referenced answers 409 with Indonesian prose. The
    // screen shows it as-is: information, not a telling-off (hard rule 6).
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify(CATEGORIES), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({
          error: {
            code: 'conflict',
            message: 'Kategori ini masih dipakai. Arsipkan saja kalau sudah tidak perlu.',
          },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      )
    })

    renderSettings()
    await userEvent.click(within(await row('Aljabar')).getByRole('button', { name: 'Hapus' }))

    expect(await screen.findByText(/masih dipakai/)).toBeInTheDocument()
  })
})
