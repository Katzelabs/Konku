import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installGlobalErrorReporting,
  reportClientError,
  resetClientErrorReporting,
} from './report-error'

/*
 * The reporter runs at the worst possible moment — after something has already
 * gone wrong — so what is worth asserting is not that it sends, but that it
 * cannot make things worse: it never throws, it is bounded, and it never
 * carries the page's contents out with it.
 */

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  // The counters are scoped to a page load in the browser. A test file is one
  // load with many crashes in it.
  resetClientErrorReporting()
  history.pushState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function sentBody(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body)
}

describe('reportClientError', () => {
  it('posts the failure to our own origin', () => {
    reportClientError(new Error('gagal render'), 'render')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    // Same origin: no CSP exception, no ingest host, no third-party script.
    expect(String(url)).toBe('/api/client-error')
    expect(init.method).toBe('POST')
    // enforceOrigin refuses a write with any other content type (D-060), so a
    // wrong header here would make every report a 403.
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.keepalive).toBe(true)

    const body = sentBody()
    expect(body.message).toBe('gagal render')
    expect(body.kind).toBe('render')
    expect(body.stack).toContain('Error')
  })

  // Hard rule 10's reasoning, applied to the one request that leaves after a
  // crash: the path says which screen broke, the query string says what the
  // person had typed into the search box.
  it('sends the path without the query string', () => {
    history.pushState({}, '', '/notes/abc?q=rahasia#bagian')

    reportClientError(new Error('gagal'), 'render')

    const body = sentBody()
    expect(body.route).toBe('/notes/abc')
    expect(JSON.stringify(body)).not.toContain('rahasia')
  })

  // React re-throws an error a boundary already handled so window.onerror still
  // sees it, so one render crash arrives twice under two kinds. Two events for
  // one bug make "how many things are broken" unanswerable.
  it('reports one error once, whichever kind arrives first', () => {
    const error = new Error('sekali saja')

    reportClientError(error, 'render')
    reportClientError(error, 'global')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentBody().kind).toBe('render')
  })

  // A component that throws, is caught, and throws again on the next render is
  // the case the cap exists for.
  it('stops after five reports in one page load', () => {
    for (let i = 0; i < 12; i++) reportClientError(new Error(`gagal ${i}`), 'render')

    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('truncates a stack rather than posting all of it', () => {
    const error = new Error('panjang')
    error.stack = 'x'.repeat(10_000)

    reportClientError(error, 'render')

    expect(sentBody().stack.length).toBeLessThanOrEqual(4_000)
  })

  it('reports something thrown that is not an Error', () => {
    reportClientError('bukan Error', 'rejection')

    expect(sentBody().message).toBe('bukan Error')
  })

  // The rule the whole module is built around. A reporter that fails while
  // reporting turns one crash into two, and the second one is invisible.
  it('does not throw when the request fails', () => {
    fetchMock.mockRejectedValue(new Error('jaringan mati'))

    expect(() => reportClientError(new Error('gagal'), 'render')).not.toThrow()
  })

  it('does not throw when fetch itself throws', () => {
    fetchMock.mockImplementation(() => {
      throw new TypeError('fetch meledak')
    })

    expect(() => reportClientError(new Error('gagal'), 'render')).not.toThrow()
  })
})

describe('installGlobalErrorReporting', () => {
  // Installed once: the listeners are for the lifetime of the page and there is
  // no uninstall, exactly as in main.tsx.
  beforeAll(() => {
    installGlobalErrorReporting()
  })

  it('reports an error no boundary can see', () => {
    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('di luar render'), message: 'di luar render' }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentBody().kind).toBe('global')
  })

  it('reports an unhandled rejection', () => {
    const event = new Event('unhandledrejection')
    Object.assign(event, { reason: new Error('promise ditolak') })

    window.dispatchEvent(event)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = sentBody()
    expect(body.kind).toBe('rejection')
    expect(body.message).toBe('promise ditolak')
  })

  // A 404 on an icon fires 'error' as well, with the element as the target. It
  // is not a crash, and reporting it would spend the five-report budget on it.
  it('ignores a resource that failed to load', () => {
    const img = document.createElement('img')
    document.body.append(img)

    img.dispatchEvent(new ErrorEvent('error', { bubbles: true, message: 'gagal muat' }))

    expect(fetchMock).not.toHaveBeenCalled()
    img.remove()
  })
})
