import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Flashcard } from './flashcard'

// The card preview turns over instead of showing both sides at once.
//
// Everything here is behaviour a CSS rule cannot be trusted with. Which face is
// *visible* is a rotation, and jsdom computes no transforms — so the assertions
// are on `inert`, which is the thing that actually decides whether the hidden
// side can be tabbed into or read out. If that regresses, the card looks
// perfect and a keyboard lands on the back of it.

function setup() {
  return render(
    <Flashcard
      // Required props since ticket 11 I5 — they were defaults inside the
      // component, which is where copy hides from review. The card editor is
      // what supplies them in the app; these are the same two words, so the
      // assertions below are unchanged.
      frontLabel="Pertanyaan"
      backLabel="Jawaban"
      front={<p>Apa itu prior?</p>}
      back={
        <p>
          Keyakinan awal. <a href="https://example.test">Sumber</a>
        </p>
      }
    />,
  )
}

/** The face element, found through the label it carries. */
function face(label: string): HTMLElement {
  const el = screen.getByText(label).parentElement
  if (!el) throw new Error(`no face for ${label}`)
  return el
}

describe('Flashcard', () => {
  it('opens on the question, with the answer turned away', () => {
    setup()

    expect(face('Pertanyaan')).not.toHaveAttribute('inert')
    expect(face('Jawaban')).toHaveAttribute('inert')

    // Named by where it goes, not by the gesture.
    expect(screen.getByRole('button', { name: 'Lihat jawaban' })).toBeInTheDocument()
  })

  it('flips from the control, and back again', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Lihat jawaban' }))

    expect(face('Jawaban')).not.toHaveAttribute('inert')
    expect(face('Pertanyaan')).toHaveAttribute('inert')

    await userEvent.click(screen.getByRole('button', { name: 'Lihat pertanyaan' }))

    expect(face('Pertanyaan')).not.toHaveAttribute('inert')
  })

  it('flips from the card itself', async () => {
    // The button is what the keyboard gets; the card is what a hand reaches
    // for, and a flashcard you cannot click is not one.
    setup()

    await userEvent.click(screen.getByText('Apa itu prior?'))

    expect(face('Jawaban')).not.toHaveAttribute('inert')
  })

  it('leaves a link in the answer alone', async () => {
    // Notes and cards carry source links (D-013). Following one must not also
    // turn the card over behind the click.
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Lihat jawaban' }))

    await userEvent.click(screen.getByRole('link', { name: 'Sumber' }))

    expect(face('Jawaban')).not.toHaveAttribute('inert')
  })

  it('keeps both sides mounted', () => {
    // Deliberate, and the reason this component says so in its own docstring:
    // the peek already holds the whole card, so flipping is free and never
    // refetches. It is *not* the D-003 mechanism — that one is the server
    // refusing to send `back` with a prompt, and it is tested elsewhere.
    setup()

    expect(screen.getByText('Apa itu prior?')).toBeInTheDocument()
    expect(screen.getByText(/Keyakinan awal/)).toBeInTheDocument()
  })
})
