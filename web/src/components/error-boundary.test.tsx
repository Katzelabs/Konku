import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary, RouteErrorBoundary } from './error-boundary'
import { resetClientErrorReporting } from '../lib/report-error'

/*
 * A render throw used to unmount the whole tree to a blank page (F-03).
 *
 * The assertions here are the two halves of that: something is on the screen
 * afterwards, and somebody was told. The third — that the crash clears when the
 * person navigates away — is what keeps the route boundary from being a dead
 * end that only a reload escapes.
 */

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  resetClientErrorReporting()
  // React prints the caught error and its component stack. That is useful in a
  // browser and noise in a suite that crashes components on purpose.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function Boom({ crash }: { crash: boolean }) {
  if (crash) throw new Error('komponen meledak')
  return <p>isi halaman</p>
}

describe('AppErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    render(
      <AppErrorBoundary>
        <Boom crash={false} />
      </AppErrorBoundary>,
    )

    expect(screen.getByText('isi halaman')).toBeInTheDocument()
  })

  it('shows a way out instead of a blank page', async () => {
    render(
      <AppErrorBoundary>
        <Boom crash />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /muat ulang/i })).toBeInTheDocument()
  })

  it('reports the crash', () => {
    render(
      <AppErrorBoundary>
        <Boom crash />
      </AppErrorBoundary>,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/client-error')

    const body = JSON.parse(init.body)
    expect(body.kind).toBe('render')
    expect(body.message).toBe('komponen meledak')
    // The component stack is the part a minified JS stack cannot tell you:
    // which component threw, not which bundle offset did.
    expect(body.stack).toContain('Component stack:')
  })
})

/*
 * The navigation control sits outside the boundary on purpose, exactly as the
 * sidebar does: it is what is still on screen after the content area has
 * crashed, and clicking it has to work.
 */
function Harness({ crashOn }: { crashOn: string }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <>
      <button onClick={() => navigate('/lain')}>pindah</button>
      <RouteErrorBoundary>
        <Boom crash={location.pathname === crashOn} />
      </RouteErrorBoundary>
    </>
  )
}

describe('RouteErrorBoundary', () => {
  it('clears the crash when the path changes', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/rusak']}>
        <Harness crashOn="/rusak" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'pindah' }))

    // Without the reset the boundary stays failed forever and the only way back
    // into the app is a reload — which is the state this feature exists to
    // replace, one level in.
    expect(screen.getByText('isi halaman')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
