import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './client'

// The API client has one error path for the whole application (D-040). If it
// gets an error shape wrong, every screen gets it wrong at once.

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request shape', () => {
  it('sends JSON, same-origin credentials, and the /api prefix', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))

    await api.post('/notes', { title: 'x' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/notes')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    // Content-Type is not decoration: the server rejects a state-changing
    // request that is not application/json (D-060), so dropping this header
    // would 415 every write.
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ title: 'x' }))
  })

  it('sends no body when there is none, so a bodyless POST stays bodyless', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await api.post('/notes/abc/restore')

    expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  })

  it('returns undefined for 204 rather than trying to parse a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(api.del('/notes/abc')).resolves.toBeUndefined()
  })
})

describe('the error path', () => {
  it('turns the standard error shape into an ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { error: { code: 'not_found', message: 'Tidak ditemukan.' } }),
    )

    const err = (await api.get('/notes/missing').catch((e) => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(404)
    expect(err.code).toBe('not_found')
    // The message is already user-facing Indonesian from the server; the
    // client must not invent its own copy.
    expect(err.message).toBe('Tidak ditemukan.')
  })

  it('carries the request id, so a screenshot maps to a log query', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, {
        error: { code: 'internal', message: 'Kesalahan.', request_id: 'req-abc-123' },
      }),
    )

    const err = (await api.get('/notes').catch((e) => e)) as ApiError
    expect(err.requestId).toBe('req-abc-123')
  })

  it('falls back to the response header when the body has no id', async () => {
    // A 502 from Caddy never reaches a Go handler and has no error body, but
    // it can still carry the header.
    fetchMock.mockResolvedValue(
      new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'X-Request-Id': 'req-from-header' },
      }),
    )

    const err = (await api.get('/notes').catch((e) => e)) as ApiError
    expect(err.requestId).toBe('req-from-header')
  })

  it('keeps a generic Indonesian message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }))

    const err = (await api.get('/notes').catch((e) => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
    expect(err.code).toBe('internal')
    expect(err.message).toMatch(/Terjadi kesalahan/)
  })

  it('does not throw on a 200 with an empty-but-valid body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []))
    await expect(api.get('/notes')).resolves.toEqual([])
  })
})
