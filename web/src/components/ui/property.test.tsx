import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Domain } from '../../api/types'
import { DomainProperty } from './property'

// The domain picker on the note and card editors.
//
// This is a regression test for a bug that made the picker completely inert:
// PropertyButton accepted `onClick` and nothing else, so wrapping it in a Radix
// `DropdownMenuTrigger asChild` threw away the `onPointerDown` and `onKeyDown`
// the trigger actually opens on. The property rendered and hovered like a
// control and did nothing when clicked, so no note or card could be given a
// domain at all.
//
// It asserts behaviour, not wiring: click the property, choose a domain, and
// expect the choice to come back out. That holds whether the menu stays Radix
// or becomes something else.

const DOMAINS: Domain[] = [
  {
    id: 'd-mtk',
    slug: 'matematika',
    label: 'Matematika',
    color: '#4F7CAC',
    weeklyQuota: 2,
    sortOrder: 0,
    archivedAt: null,
  },
  {
    id: 'd-bio',
    slug: 'biologi',
    label: 'Biologi',
    color: '#6A8D73',
    weeklyQuota: 1,
    sortOrder: 1,
    archivedAt: null,
  },
]

/** The picker as an editor uses it: holding its own value. */
function Harness({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <>
      <DomainProperty domains={DOMAINS} value={value} onChange={setValue} />
      <output data-testid="chosen">{value ?? 'none'}</output>
    </>
  )
}

describe('DomainProperty', () => {
  it('opens on click and picks a domain', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: /Pilih domain/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Matematika' }))

    expect(screen.getByTestId('chosen')).toHaveTextContent('d-mtk')
    // The trigger now shows the choice rather than the placeholder, which is
    // the half of this a user actually sees.
    expect(screen.getByRole('button', { name: /Matematika/ })).toBeInTheDocument()
  })

  it('opens from the keyboard', async () => {
    // The trigger's key handling travels the same path as its pointer handling,
    // so a component that drops one usually drops both.
    render(<Harness />)

    await userEvent.tab()
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByRole('menuitem', { name: 'Biologi' })).toBeInTheDocument()
  })

  it('clears back to no domain', async () => {
    // Untagged is a legitimate state, not an unfilled field: capture must never
    // block on a decision the user has not made (hard rule 7).
    render(<Harness initial="d-bio" />)

    await userEvent.click(screen.getByRole('button', { name: /Biologi/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Tanpa domain/ }))

    expect(screen.getByTestId('chosen')).toHaveTextContent('none')
  })
})
