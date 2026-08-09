import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

/**
 * The stuck-delete-dialog bug, as a test (D-063).
 *
 *     onSuccess: () => qc.invalidateQueries(...)     // WRONG
 *     onSuccess: () => { qc.invalidateQueries(...) } // right
 *
 * TanStack Query awaits whatever `onSuccess` returns before running the
 * callbacks passed to `mutate` (mutation.js: `await this.options.onSuccess?.()`).
 * Return the invalidate and those callbacks wait for every active refetch to
 * settle — including, after a delete, a request for the row that was just
 * deleted, and including that request's retries and backoff.
 *
 * On the mechanism: CLAUDE.md describes the failing refetch as rejecting and
 * the `mutate` callbacks being "skipped entirely". That is not what this
 * version does. `refetchQueries` wraps each fetch in `.catch(noop)` unless
 * `throwOnError` is set, and the app does not set it, so the invalidate
 * promise resolves either way. The callbacks are therefore *delayed*, not
 * skipped — which produces the same reported symptom, a dialog that will not
 * close, because the delay is a failing request with its full retry schedule.
 *
 * The tests below assert the delay, because that is what is demonstrable.
 */

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const listKey = ['notes'] as const

/**
 * An active list query whose refetch hangs until released, alongside a
 * mutation that invalidates it — the shape of "delete a row, then invalidate
 * the list it was in".
 *
 * The refetch is held open deliberately rather than left to real retry timing,
 * so the difference between the two forms is deterministic instead of a race.
 */
function renderDeleteScenario(returnTheInvalidate: boolean) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })

  let firstLoadDone = false
  let releaseRefetch: (() => void) | undefined
  const refetchPending = new Promise<void>((resolve) => {
    releaseRefetch = resolve
  })

  const { result } = renderHook(
    () => {
      // Active, so invalidate triggers a real refetch. An inactive query is
      // only marked stale and the bug does not reproduce at all.
      const list = useQuery({
        queryKey: listKey,
        queryFn: async () => {
          if (firstLoadDone) await refetchPending
          firstLoadDone = true
          return ['a-note']
        },
      })

      const remove = useMutation({
        mutationFn: async () => undefined,
        onSuccess: returnTheInvalidate
          ? // WRONG: awaited before mutate's callbacks run.
            () => qc.invalidateQueries({ queryKey: listKey })
          : // Right: braces, so nothing is returned and nothing is awaited.
            () => {
              qc.invalidateQueries({ queryKey: listKey })
            },
      })

      return { list, remove }
    },
    { wrapper: wrapper(qc) },
  )

  return { result, release: () => releaseRefetch?.() }
}

describe('onSuccess must not return the invalidate promise', () => {
  it('blocks the caller\'s callback until the refetch settles when returned', async () => {
    const { result, release } = renderDeleteScenario(true)
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    let dialogClosed = false
    await act(async () => {
      result.current.remove.mutate(undefined, {
        onSuccess: () => {
          dialogClosed = true
        },
      })
      await new Promise((r) => setTimeout(r, 50))
    })

    // The write already happened on the server. But the mutation still reads
    // as pending, and the dialog is still open, because both are now waiting
    // on a refetch they should never have been coupled to. Nothing looks
    // wrong server-side, which is precisely why this shipped.
    expect(result.current.remove.isSuccess).toBe(false)
    expect(result.current.remove.isPending).toBe(true)
    expect(dialogClosed).toBe(false)

    // Releasing the refetch finally lets it through, which is the "closes
    // eventually, after a pause" symptom.
    await act(async () => {
      release()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(dialogClosed).toBe(true)
    expect(result.current.remove.isSuccess).toBe(true)
  })

  it('runs the caller\'s callback immediately when braces are used', async () => {
    const { result, release } = renderDeleteScenario(false)
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    let dialogClosed = false
    await act(async () => {
      result.current.remove.mutate(undefined, {
        onSuccess: () => {
          dialogClosed = true
        },
      })
      await new Promise((r) => setTimeout(r, 50))
    })

    // The refetch is still hanging, and the dialog has closed anyway, and the
    // mutation reads as done. That is the entire point: closing a dialog is
    // not the refetch's business.
    expect(dialogClosed).toBe(true)
    expect(result.current.remove.isSuccess).toBe(true)

    release()
  })
})
