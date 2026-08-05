// Every endpoint returns the same error shape (D-040), so the client needs
// exactly one error path rather than per-endpoint special cases.
export interface ApiErrorBody {
  code: string
  message: string
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, body: ApiErrorBody) {
    // message is already user-facing Bahasa Indonesia from the server.
    super(body.message)
    this.name = 'ApiError'
    this.code = body.code
    this.status = status
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
    let body: ApiErrorBody = {
      code: 'internal',
      message: 'Terjadi kesalahan. Coba lagi sebentar lagi.',
    }
    try {
      const parsed = await res.json()
      if (parsed?.error) body = parsed.error
    } catch {
      // Non-JSON error (proxy, gateway). Keep the generic message.
    }
    throw new ApiError(res.status, body)
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
}
