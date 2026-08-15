import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFlushOnHide, type PendingWrite } from './useFlushOnHide'

/*
 * The tab-close half of "nothing you write disappears silently".
 *
 * The note editor's save-on-unmount is a React cleanup: it runs on SPA
 * navigation and not on a tab close, a reload, or a link off the origin. This
 * hook is the mechanism that covers those, so what it is worth asserting is
 * the part that is easy to get subtly wrong — which event does what, and that
 * one departure is not two writes.
 */

let fetchMock: ReturnType<typeof vi.fn>
let visibility: DocumentVisibilityState

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)

  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function hide() {
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
}

function show() {
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
}

function close() {
  window.dispatchEvent(new Event('pagehide'))
}

const write: PendingWrite = {
  path: '/notes/n1',
  method: 'PATCH',
  body: { title: 'Judul', contentMd: 'isi' },
}

describe('useFlushOnHide', () => {
  it('runs the ordinary save when the page is hidden but still alive', () => {
    const onHidden = vi.fn()
    renderHook(() => useFlushOnHide({ onHidden }))

    hide()

    expect(onHidden).toHaveBeenCalledTimes(1)
    // The keepalive path is held back: the page is still running, so the
    // mutation that onHidden started can read its own response. Sending both
    // would be one write done twice.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the pending write with keepalive when the document goes away', () => {
    renderHook(() => useFlushOnHide({ onHidden: () => {}, pending: () => write }))

    close()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/notes/n1')
    expect(init.method).toBe('PATCH')
    // Without this the request is cancelled with the document and the whole
    // hook is decoration.
    expect(init.keepalive).toBe(true)
    // Same-origin credentials and the same headers as api/client.ts, or the
    // session cookie does not ride along and enforceOrigin answers 403.
    expect(init.credentials).toBe('same-origin')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(write.body)
  })

  it('sends nothing when there is nothing pending', () => {
    renderHook(() => useFlushOnHide({ pending: () => null }))

    hide()
    close()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Closing a tab fires visibilitychange and then pagehide. A caller with no
  // onHidden gets the keepalive path on both, and a POST sent twice would be
  // two rows — which is why the hook dedups rather than leaving it to callers.
  it('does not send the same body twice for one departure', () => {
    renderHook(() => useFlushOnHide({ pending: () => write }))

    hide()
    close()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends again after the page has come back and been edited', () => {
    let body = { title: 'Judul', contentMd: 'isi' }
    renderHook(() => useFlushOnHide({ pending: () => ({ ...write, body }) }))

    hide()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    show()
    body = { title: 'Judul', contentMd: 'isi, dan lebih banyak lagi' }
    hide()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).contentMd).toBe(
      'isi, dan lebih banyak lagi',
    )
  })

  it('sends nothing while the page is merely visible', () => {
    const onHidden = vi.fn()
    renderHook(() => useFlushOnHide({ onHidden, pending: () => write }))

    show()

    expect(onHidden).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // A body over the 64 KiB keepalive budget makes fetch reject outright rather
  // than truncate, so the flag comes off and the request is at least attempted.
  it('drops keepalive rather than the request when the body is too large', () => {
    const huge = { contentMd: 'a'.repeat(70 * 1024) }
    renderHook(() => useFlushOnHide({ pending: () => ({ ...write, body: huge }) }))

    close()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(false)
  })

  it('stops listening once the editor unmounts', () => {
    const onHidden = vi.fn()
    const { unmount } = renderHook(() => useFlushOnHide({ onHidden, pending: () => write }))

    unmount()
    hide()
    close()

    expect(onHidden).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
