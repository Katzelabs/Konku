import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MultiSelect, type SelectOption } from './multi-select'

// The filter bar's dropdown (D-078).
//
// It replaced a row of chips, so what matters is the two things chips could not
// do: choose more than one, and find one by typing. The third assertion is the
// reason it is a Popover and not a DropdownMenu — a Radix menu owns typeahead,
// and a search box inside one loses its keystrokes to the menu.

const OPTIONS: SelectOption[] = [
  { id: 'd-mtk', label: 'Matematika', color: '#4F7CAC' },
  { id: 'd-psi', label: 'Psikologi', color: '#B08968' },
  { id: 'd-mus', label: 'Musik', color: '#8E7DBE' },
]

function Harness({ initial = [] }: { initial?: string[] }) {
  const [selected, setSelected] = useState<string[]>(initial)
  return (
    <>
      <MultiSelect
        label="Domain"
        options={OPTIONS}
        selected={selected}
        // The functional form, which is what the real callers do against the
        // URL — see the note on `onToggle`.
        onToggle={(id) =>
          setSelected((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
          )
        }
        onClear={() => setSelected([])}
        searchPlaceholder="Cari domain…"
        emptyText="Belum ada domain."
      />
      <output data-testid="chosen">{selected.join(',') || 'none'}</output>
    </>
  )
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Domain' }))
}

describe('MultiSelect', () => {
  it('selects more than one', async () => {
    // The whole point. A chip row could only ever express one domain, so
    // "notes in maths or psychology" was not a question the screen could ask.
    render(<Harness />)
    await openMenu()

    await userEvent.click(await screen.findByRole('button', { name: 'Matematika' }))
    await userEvent.click(screen.getByRole('button', { name: 'Psikologi' }))

    expect(screen.getByTestId('chosen')).toHaveTextContent('d-mtk,d-psi')
  })

  it('keeps typed characters instead of losing them to a menu', async () => {
    // The reason this is a Popover. Inside a Radix DropdownMenu the same input
    // would hand every keystroke to the menu's typeahead and end up empty,
    // which is the bug CategoryProperty sidesteps by expanding inline.
    render(<Harness />)
    await openMenu()

    const search = await screen.findByPlaceholderText('Cari domain…')
    await userEvent.type(search, 'mus')

    expect(search).toHaveValue('mus')
    expect(screen.getByRole('button', { name: 'Musik' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Matematika' })).not.toBeInTheDocument()
  })

  it('deselects on a second click', async () => {
    render(<Harness initial={['d-mtk']} />)
    await openMenu()

    await userEvent.click(await screen.findByRole('button', { name: 'Matematika' }))

    expect(screen.getByTestId('chosen')).toHaveTextContent('none')
  })

  it('clears everything at once', async () => {
    render(<Harness initial={['d-mtk', 'd-psi']} />)
    await openMenu()

    await userEvent.click(await screen.findByRole('button', { name: /Hapus pilihan/ }))

    expect(screen.getByTestId('chosen')).toHaveTextContent('none')
  })

  it('names the first choice on the trigger and counts the rest', async () => {
    // "Matematika +1" rather than "2 dipilih": the filter bar has to be
    // readable without opening it, which is the one thing chips were good at.
    render(<Harness initial={['d-mtk', 'd-psi']} />)

    const trigger = screen.getByRole('button', { name: 'Domain' })
    expect(trigger).toHaveTextContent('Matematika')
    expect(trigger).toHaveTextContent('+1')
  })

  it('offers nothing to clear when nothing is chosen', async () => {
    render(<Harness />)
    await openMenu()

    expect(await screen.findByPlaceholderText('Cari domain…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hapus pilihan/ })).not.toBeInTheDocument()
  })

  it('emits the id it flipped, not the resulting selection', async () => {
    // The contract that makes the URL the source of truth. Handing back
    // `[...selected, id]` would compute the next selection from a prop, and
    // ticking a second option before the first navigation re-rendered would
    // drop the first — which is exactly what it did until it emitted intent.
    const toggled: unknown[] = []
    render(
      <MultiSelect
        label="Domain"
        options={OPTIONS}
        selected={['d-mtk']}
        onToggle={(id) => toggled.push(id)}
        onClear={() => {}}
        searchPlaceholder="Cari domain…"
        emptyText="Belum ada domain."
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Domain' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Psikologi' }))

    expect(toggled).toEqual(['d-psi'])
  })

  it('says so when the search matches nothing', async () => {
    render(<Harness />)
    await openMenu()

    await userEvent.type(await screen.findByPlaceholderText('Cari domain…'), 'zzz')

    expect(screen.getByText('Tidak ada yang cocok.')).toBeInTheDocument()
  })
})
