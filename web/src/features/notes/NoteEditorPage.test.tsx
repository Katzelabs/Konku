import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NoteEditorPage from './NoteEditorPage'

/*
 * Autosave, and the retry it always claimed to be making.
 *
 * The status line has said "Belum tersimpan, mencoba lagi…" since autosave
 * shipped, and nothing retried. The debounce effect depends on
 * [dirty, title, content, domainId, categoryIds]; a failed save leaves
 * `saved.current` untouched, so every one of those is the value it already
 * had and the effect never re-runs. TanStack does not fill the gap either —
 * mutations default to zero retries. The only thing that tried again was the
 * next keystroke, which is exactly what stops when someone finishes writing.
 *
 * Fake timers throughout, because the whole point is what happens when nobody
 * touches the keyboard. `advanceTimersByTimeAsync` rather than `waitFor`:
 * testing-library's fake-timer detection looks for `jest`, which vitest does
 * not define, so waitFor would poll a clock that never moves.
 */

const NOTE = {
  id: 'n1',
  title: 'Judul',
  contentMd: 'isi',
  domainId: null,
  categoryIds: [],
  createdAt: '2026-08-15T00:00:00Z',
  updatedAt: '2026-08-15T00:00:00Z',
}

const AUTOSAVE_MS = 1500
/** The first entry of RETRY_MS in the page. */
const FIRST_BACKOFF_MS = 2000

let fetchMock: ReturnType<typeof vi.fn>
/** Set per test: what the next PATCH should do. */
let patchFails = false

beforeEach(() => {
  vi.useFakeTimers()
  patchFails = false

  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/domains' || url === '/api/categories') return json([])
    if (url === '/api/notes/n1' && method === 'GET') return json(NOTE)
    if (url === '/api/notes/n1' && method === 'PATCH') {
      if (patchFails) {
        return json({ error: { code: 'internal', message: 'Gagal' } }, 500)
      }
      return json({ ...NOTE, ...JSON.parse(String(init?.body)) })
    }
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function patches() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
}

/**
 * Advance the clock, then let everything that advance unblocked settle.
 *
 * The trailing advance is not padding. TanStack runs every mutation through
 * its retryer, which resolves through timers of its own, so a fetch that has
 * already answered still needs the clock to move before the mutation reaches
 * `error` and the component re-renders. Flushing microtasks is not enough —
 * without this, every assertion reads the state one render behind the truth.
 */
const SETTLE_MS = 10

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
  })
}

async function renderEditor() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/notes/n1']}>
        <Routes>
          <Route path="/notes/:id" element={<NoteEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await tick()
  return view
}

function type(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Tulis di sini…'), {
    target: { value: text },
  })
}

describe('autosave', () => {
  it('saves what was typed once the debounce elapses', async () => {
    await renderEditor()
    type('isi, dengan tambahan')

    expect(patches()).toHaveLength(0)
    await tick(AUTOSAVE_MS)

    expect(patches()).toHaveLength(1)
    expect(JSON.parse(String(patches()[0][1]?.body)).contentMd).toBe('isi, dengan tambahan')
    expect(screen.getByText('Tersimpan')).toBeInTheDocument()
  })
})

describe('retry after a failed save', () => {
  it('tries again on its own, with nobody touching the keyboard', async () => {
    await renderEditor()
    patchFails = true
    type('isi, dengan tambahan')

    await tick(AUTOSAVE_MS)
    expect(patches()).toHaveLength(1)
    expect(screen.getByText('Belum tersimpan, mencoba lagi…')).toBeInTheDocument()

    // The regression this file exists for: before the retry effect, the clock
    // could run all day here and this stayed at one.
    await tick(FIRST_BACKOFF_MS)
    expect(patches()).toHaveLength(2)
  })

  it('keeps retrying, and stops once one lands', async () => {
    await renderEditor()
    patchFails = true
    type('isi, dengan tambahan')

    await tick(AUTOSAVE_MS)
    await tick(FIRST_BACKOFF_MS)
    expect(patches()).toHaveLength(2)

    // Second backoff is longer than the first, so the same advance is not
    // enough — the delay really does back off rather than hammering.
    await tick(FIRST_BACKOFF_MS)
    expect(patches()).toHaveLength(2)

    patchFails = false
    await tick(60_000)
    expect(patches()).toHaveLength(3)
    expect(screen.getByText('Tersimpan')).toBeInTheDocument()

    // Saved, so nothing is outstanding and no further attempt is scheduled.
    await tick(60_000)
    expect(patches()).toHaveLength(3)
  })

  it('sends the text as it stands now, not the text that failed', async () => {
    await renderEditor()
    patchFails = true
    type('draf pertama')
    await tick(AUTOSAVE_MS)
    expect(patches()).toHaveLength(1)

    // Typing during the backoff restarts the debounce as well, so let both
    // the debounce and the backoff run out.
    type('draf pertama, diperbaiki')
    patchFails = false
    await tick(AUTOSAVE_MS + FIRST_BACKOFF_MS)

    // Whichever attempt got there, it carried the current text. TanStack's
    // own `retry` would have re-sent "draf pertama" and undone the edit —
    // which is why the retry goes through doSave instead.
    const last = JSON.parse(String(patches().at(-1)?.[1]?.body))
    expect(last.contentMd).toBe('draf pertama, diperbaiki')
    expect(screen.getByText('Tersimpan')).toBeInTheDocument()
  })

  it('retries immediately when the browser comes back online', async () => {
    await renderEditor()
    patchFails = true
    type('isi, dengan tambahan')

    await tick(AUTOSAVE_MS)
    expect(patches()).toHaveLength(1)

    patchFails = false
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await tick()

    // No backoff waited out: reconnecting is better evidence than a timer.
    expect(patches()).toHaveLength(2)
    expect(screen.getByText('Tersimpan')).toBeInTheDocument()
  })
})

describe('leaving the page', () => {
  it('saves on unmount when there is something unsaved', async () => {
    const { unmount } = await renderEditor()
    type('isi, dengan tambahan')

    // Straight out, without waiting for the debounce — this is the back link.
    unmount()
    await tick()

    expect(patches()).toHaveLength(1)
  })

  it('saves when the tab is backgrounded', async () => {
    await renderEditor()
    type('isi, dengan tambahan')

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await tick()

    expect(patches()).toHaveLength(1)
    expect(screen.getByText('Tersimpan')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('sends a keepalive write when the tab closes', async () => {
    await renderEditor()
    type('isi, dengan tambahan')

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(patches()).toHaveLength(1)
    expect(patches()[0][1]?.keepalive).toBe(true)
    expect(JSON.parse(String(patches()[0][1]?.body)).contentMd).toBe('isi, dengan tambahan')
  })

  it('sends nothing on the way out when everything is already saved', async () => {
    const { unmount } = await renderEditor()
    type('isi, dengan tambahan')
    await tick(AUTOSAVE_MS)
    expect(patches()).toHaveLength(1)

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
    })
    unmount()
    await tick()

    expect(patches()).toHaveLength(1)
  })
})
