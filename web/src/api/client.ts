import { currentCopy } from '../i18n'

// Every endpoint returns the same error shape (D-040), so the client needs
// exactly one error path rather than per-endpoint special cases.
export interface ApiErrorBody {
  code: string
  message: string
  request_id?: string
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  /**
   * The server's request ID for the failed call, when there is one.
   *
   * The same value is in the response header, in the error body, and in every
   * log line for that request, so a screenshot maps to a log query (D-062).
   */
  readonly requestId?: string

  constructor(status: number, body: ApiErrorBody, requestId?: string) {
    // message is already user-facing Bahasa Indonesia from the server.
    super(body.message)
    this.name = 'ApiError'
    this.code = body.code
    this.status = status
    this.requestId = body.request_id || requestId || undefined
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    // Same-origin, so the session cookie rides along without CORS ceremony.
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      // Forces a preflight on cross-origin requests, which is cheap CSRF
      // hardening if the frontend is ever split onto its own subdomain.
      'X-Requested-With': 'konku',
      ...init?.headers,
    },
  })

  if (!res.ok) {
    // A response that reached a Go handler always carries a message already in
    // the reader's language (11 I3), and the branch below uses it verbatim.
    // This fallback is for the ones that never got that far -- a proxy or
    // gateway error whose body is not JSON -- so the frontend owns the
    // sentence. `currentCopy()` rather than `useCopy()`: this is not a
    // component, and threading Copy through eight query modules to reach one
    // string is the worse trade.
    let body: ApiErrorBody = {
      code: 'internal',
      message: currentCopy().common.error.unexpected,
    }
    try {
      const parsed = await res.json()
      if (parsed?.error) body = parsed.error
    } catch {
      // Non-JSON error (proxy, gateway). Keep the generic message.
    }
    // Read the header too: a 502 from Caddy never reaches a Go handler, so it
    // has no error body, but it may still carry the ID.
    throw new ApiError(res.status, body, res.headers.get('X-Request-Id') ?? undefined)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  // A body on DELETE is unusual but not wrong, and account deletion needs one:
  // the password confirming an irreversible action does not belong in a query
  // string, where it would land in logs and browser history.
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
}
