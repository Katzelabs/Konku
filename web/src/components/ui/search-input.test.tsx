import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SearchInput } from './search-input'

/*
 * The search box writes to the URL, and the URL is history.
 *
 * Every keystroke used to be a `replaceState`, and each one changed the
 * filtered id list, which re-fired useAutoSelect into a second one. Safari
 * throws SecurityError past ~100 in thirty seconds. What that limit would take
 * to assert is a browser, so these assert the thing that causes it: how many
 * times a burst of typing reaches the caller.
 *
 * `fireEvent` rather than userEvent throughout — userEvent's own waiting does
 * not survive fake timers, and a change event per character is exactly what it
 * would have produced on a controlled input anyway.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Type `text` one character at a time, as a keyboard would. */
function type(box: HTMLElement, text: string) {
  for (let i = 1; i <= text.length; i++) {
    fireEvent.change(box, { target: { value: text.slice(0, i) } })
  }
}

function box() {
  return screen.getByRole('searchbox', { name: 'Cari catatan' })
}

it('commits once for a burst of typing, not once per key', () => {
  const onChange = vi.fn()
  render(
    <SearchInput value="" onChange={onChange} placeholder="Cari judul…" label="Cari catatan" />,
  )

  type(box(), 'prior')

  // Five characters, nothing sent yet — the box holds its own text.
  expect(onChange).not.toHaveBeenCalled()

  act(() => {
    vi.advanceTimersByTime(250)
  })

  expect(onChange).toHaveBeenCalledTimes(1)
  expect(onChange).toHaveBeenCalledWith('prior')
})

it('shows what was typed while the write is still pending', () => {
  render(<SearchInput value="" onChange={vi.fn()} placeholder="Cari" label="Cari catatan" />)

  type(box(), 'pri')

  // The debounce is on the URL write and never on the field: a box that lags
  // behind the keyboard would be the fix being worse than the bug.
  expect(box()).toHaveValue('pri')
})

it('sends immediately on Enter', () => {
  const onChange = vi.fn()
  render(<SearchInput value="" onChange={onChange} placeholder="Cari" label="Cari catatan" />)

  type(box(), 'prior')
  fireEvent.keyDown(box(), { key: 'Enter' })

  expect(onChange).toHaveBeenCalledWith('prior')
})

it('follows the value when it changes from outside', () => {
  const onChange = vi.fn()
  const { rerender } = render(
    <SearchInput value="prior" onChange={onChange} placeholder="Cari" label="Cari catatan" />,
  )

  // Back, or a cleared filter: the URL is the source of truth for the filter
  // and it just changed underneath.
  rerender(
    <SearchInput value="" onChange={onChange} placeholder="Cari" label="Cari catatan" />,
  )

  expect(box()).toHaveValue('')

  // And that sync is not itself a change to send back, or the two would write
  // to each other forever.
  act(() => {
    vi.advanceTimersByTime(250)
  })
  expect(onChange).not.toHaveBeenCalled()
})

it('does not lose keystrokes typed while a write is in flight', () => {
  const onChange = vi.fn()
  const { rerender } = render(
    <SearchInput value="" onChange={onChange} placeholder="Cari" label="Cari catatan" />,
  )

  type(box(), 'pri')
  act(() => {
    vi.advanceTimersByTime(250)
  })
  expect(onChange).toHaveBeenCalledWith('pri')

  // Still typing while the router re-renders the page with the value it was
  // just handed. Treating that echo as an outside change would put the box
  // back to "pri" mid-word.
  fireEvent.change(box(), { target: { value: 'prio' } })
  rerender(
    <SearchInput value="pri" onChange={onChange} placeholder="Cari" label="Cari catatan" />,
  )
  fireEvent.change(box(), { target: { value: 'prior' } })

  expect(box()).toHaveValue('prior')
})
