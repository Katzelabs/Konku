import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PeekProvider, useAutoSelect, usePeekedId } from './peek-route'

// List view opens its top row on arrival (D-078).
//
// The three things worth guarding are the three ways this goes wrong: it does
// nothing in grid view, it does not push a history entry, and it re-selects
// when the open item leaves the list rather than leaving a preview of something
// that is no longer beside it.

/** Shows the current URL, so the assertions can read what navigation happened. */
function Probe() {
  const location = useLocation()
  return <output data-testid="url">{location.pathname}</output>
}

function List({ enabled, ids }: { enabled: boolean; ids: string[] }) {
  const peekedId = usePeekedId('/notes/')
  useAutoSelect({ enabled, ids, peekedId, toPath: (id) => `/notes/${id}` })
  return <output data-testid="peeked">{peekedId ?? 'none'}</output>
}

/**
 * The list, mounted the way App mounts it: inside a PeekProvider that is told
 * what the real location is. The provider is the only way a component rendered
 * against the background location can see the peek (see PeekState.background).
 */
function Harness({ enabled, ids }: { enabled: boolean; ids: string[] }) {
  return (
    <MemoryRouter initialEntries={['/notes']}>
      <Inner enabled={enabled} ids={ids} />
    </MemoryRouter>
  )
}

function Inner({ enabled, ids }: { enabled: boolean; ids: string[] }) {
  const location = useLocation()
  const background =
    (location.state as { peekBackground?: { pathname: string; search: string } } | null)
      ?.peekBackground ?? null

  return (
    <PeekProvider
      peekedPath={background ? location.pathname : null}
      background={background}
    >
      <Probe />
      <Routes location={background ?? location}>
        <Route path="/notes" element={<List enabled={enabled} ids={ids} />} />
      </Routes>
    </PeekProvider>
  )
}

describe('useAutoSelect', () => {
  it('opens the top item on arrival', async () => {
    render(<Harness enabled ids={['a', 'b', 'c']} />)

    expect(await screen.findByText('/notes/a')).toBeInTheDocument()
    expect(screen.getByTestId('peeked')).toHaveTextContent('a')
  })

  it('does nothing in grid view', () => {
    // The preview is a modal there, and opening a modal at someone who has
    // just arrived is hostile.
    render(<Harness enabled={false} ids={['a', 'b']} />)

    expect(screen.getByTestId('url')).toHaveTextContent('/notes')
    expect(screen.getByTestId('peeked')).toHaveTextContent('none')
  })

  it('does nothing with an empty list', () => {
    render(<Harness enabled ids={[]} />)

    expect(screen.getByTestId('url')).toHaveTextContent('/notes')
  })

  it('re-selects when the open item leaves the list', async () => {
    // Filtered out, searched past, or deleted. A preview of something no
    // longer in the list beside it is a dead end, and the list is where the
    // user is looking.
    const { rerender } = render(<Harness enabled ids={['a', 'b']} />)
    expect(await screen.findByText('/notes/a')).toBeInTheDocument()

    rerender(<Harness enabled ids={['b']} />)
    expect(await screen.findByText('/notes/b')).toBeInTheDocument()
  })

  it('leaves an already-open item alone', async () => {
    // It selects the *top* item only when nothing valid is open. Re-selecting
    // on every render would drag the preview back to the top of the list every
    // time the search box was typed in.
    const { rerender } = render(<Harness enabled ids={['a', 'b', 'c']} />)
    expect(await screen.findByText('/notes/a')).toBeInTheDocument()

    // 'a' is still in the list, just no longer first.
    rerender(<Harness enabled ids={['b', 'a', 'c']} />)
    expect(screen.getByTestId('peeked')).toHaveTextContent('a')
  })
})
