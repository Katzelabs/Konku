import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CardEditorPage from './CardEditorPage'

/*
 * The card editor used to discard everything typed into it the moment you left
 * the screen — no autosave, no save-on-unmount, no confirm, no signal. Explicit
 * save is still the design, and the header comment still defends it; what the
 * screen no longer does is throw the work away on the way out.
 *
 * The condition these tests exist to pin down is **both sides filled**. It is
 * what keeps the original argument standing: a card with a question and an
 * answer is a card, and the due list only ever receives cards the person
 * actually wrote.
 */

const CARD = {
  id: 'c1',
  front: 'Apa itu prior?',
  back: 'Keyakinan awal sebelum melihat data.',
  type: 'basic' as const,
  domainId: null,
  categoryIds: [],
  createdAt: '2026-08-15T00:00:00Z',
  updatedAt: '2026-08-15T00:00:00Z',
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/domains' || url === '/api/categories') return json([])
    if (url === '/api/cards/c1' && method === 'GET') return json(CARD)
    if (url === '/api/cards/c1' && method === 'PATCH') {
      return json({ ...CARD, ...JSON.parse(String(init?.body)) })
    }
    if (url === '/api/cards/c1' && method === 'DELETE') {
      return new Response(null, { status: 204 })
    }
    if (url === '/api/cards' && method === 'POST') {
      return json({ ...CARD, ...JSON.parse(String(init?.body)) })
    }
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function writes(method: 'POST' | 'PATCH') {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === method)
}

/** See the note on the same helper in NoteEditorPage.test.tsx. */
const SETTLE_MS = 10

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
  })
}

async function renderEditor(path: '/cards/c1' | '/cards/new') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/cards/new" element={<CardEditorPage />} />
          <Route path="/cards/:id" element={<CardEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await tick()
  return view
}

function fill(label: 'Apa itu prior?' | 'Keyakinan awal sebelum melihat data.', text: string) {
  fireEvent.change(screen.getByPlaceholderText(label), { target: { value: text } })
}

/** The question box, by its placeholder. */
const QUESTION = 'Apa itu prior?'
/** The answer box, by its placeholder. */
const ANSWER = 'Keyakinan awal sebelum melihat data.'

describe('leaving an existing card mid-edit', () => {
  it('saves what was typed instead of discarding it', async () => {
    const { unmount } = await renderEditor('/cards/c1')
    fill(QUESTION, 'Apa itu posterior?')

    // The back link, the sidebar, anything that unmounts the route.
    unmount()
    await tick()

    expect(writes('PATCH')).toHaveLength(1)
    expect(JSON.parse(String(writes('PATCH')[0][1]?.body)).front).toBe('Apa itu posterior?')
  })

  it('says so on screen while there is something unsaved', async () => {
    await renderEditor('/cards/c1')
    expect(screen.queryByText('Belum tersimpan')).not.toBeInTheDocument()

    fill(QUESTION, 'Apa itu posterior?')
    expect(screen.getByText('Belum tersimpan')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await tick()
    expect(screen.queryByText('Belum tersimpan')).not.toBeInTheDocument()
  })

  it('writes nothing when nothing was changed', async () => {
    const { unmount } = await renderEditor('/cards/c1')

    unmount()
    await tick()

    expect(writes('PATCH')).toHaveLength(0)
  })

  // The condition that keeps "half-typed questions shouldn't show up in
  // tomorrow's due list" true. The server would reject this anyway; the point
  // is that the editor does not fire a doomed request on the way out.
  it('writes nothing when one side has been emptied', async () => {
    const { unmount } = await renderEditor('/cards/c1')
    fill(ANSWER, '')

    unmount()
    await tick()

    expect(writes('PATCH')).toHaveLength(0)
  })

  it('writes nothing after the card has been deleted', async () => {
    const { unmount } = await renderEditor('/cards/c1')
    fill(QUESTION, 'Apa itu posterior?')

    fireEvent.click(screen.getByRole('button', { name: /Hapus kartu/ }))
    await tick()
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }))
    await tick()

    unmount()
    await tick()

    // A PATCH at a card that has just gone is a request that exists only to be
    // refused, and it would flash a failure over a screen that is leaving.
    expect(writes('PATCH')).toHaveLength(0)
  })
})

describe('leaving a new card mid-edit', () => {
  it('creates it when both sides are there', async () => {
    const { unmount } = await renderEditor('/cards/new')
    fill(QUESTION, 'Apa itu likelihood?')
    fill(ANSWER, 'Peluang data di bawah suatu hipotesis.')

    unmount()
    await tick()

    expect(writes('POST')).toHaveLength(1)
    expect(JSON.parse(String(writes('POST')[0][1]?.body)).front).toBe('Apa itu likelihood?')
  })

  it('creates nothing from a question with no answer', async () => {
    const { unmount } = await renderEditor('/cards/new')
    fill(QUESTION, 'Apa itu likelihood?')

    unmount()
    await tick()

    expect(writes('POST')).toHaveLength(0)
  })
})

describe('the tab going away', () => {
  it('saves an existing card when the tab is backgrounded', async () => {
    await renderEditor('/cards/c1')
    fill(QUESTION, 'Apa itu posterior?')

    await hide()

    expect(writes('PATCH')).toHaveLength(1)
    expect(screen.queryByText('Belum tersimpan')).not.toBeInTheDocument()
  })

  it('sends a keepalive write for an existing card when the tab closes', async () => {
    await renderEditor('/cards/c1')
    fill(QUESTION, 'Apa itu posterior?')

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(writes('PATCH')).toHaveLength(1)
    expect(writes('PATCH')[0][1]?.keepalive).toBe(true)
  })

  /*
   * The one asymmetry in this file, and it is deliberate.
   *
   * The keepalive path cannot read a response, so it cannot know whether the
   * write landed. A PATCH sent twice is one row written twice; a POST sent
   * twice is two cards. So a creation never rides that path — it goes through
   * the mutation on `visibilitychange`, which does know.
   */
  it('creates a new card on hide, and never on the keepalive path', async () => {
    await renderEditor('/cards/new')
    fill(QUESTION, 'Apa itu likelihood?')
    fill(ANSWER, 'Peluang data di bawah suatu hipotesis.')

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(writes('POST')).toHaveLength(0)

    await hide()
    expect(writes('POST')).toHaveLength(1)
  })

  /*
   * Saving a new card on hide has to move the screen onto the card it just
   * created. Without that the URL is still /cards/new when the tab comes back,
   * the editor still believes it is creating, and the next save posts a second
   * card rather than patching the first — a duplicate produced by the safety
   * net, which is a worse bug than the one it was added to fix.
   */
  it('patches rather than duplicating after a save on hide', async () => {
    await renderEditor('/cards/new')
    fill(QUESTION, 'Apa itu likelihood?')
    fill(ANSWER, 'Peluang data di bawah suatu hipotesis.')

    await hide()
    expect(writes('POST')).toHaveLength(1)

    vi.restoreAllMocks()
    fill(QUESTION, 'Apa itu likelihood, tepatnya?')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await tick()

    expect(writes('POST')).toHaveLength(1)
    expect(writes('PATCH')).toHaveLength(1)
  })
})

async function hide() {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await tick()
}
