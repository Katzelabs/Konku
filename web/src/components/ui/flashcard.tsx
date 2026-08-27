import { useState, type MouseEvent, type ReactNode } from 'react'
import { FlipHorizontal2 } from 'lucide-react'
import { useCopy } from '../../i18n'
import { cn } from '../../lib/utils'
import { Button } from './button'

/** Which face is showing. */
export type CardFace = 'front' | 'back'

/**
 * A card with two sides, turned over rather than scrolled past.
 *
 * The card peek used to be the note peek with different labels: a heading, the
 * question, a rule, the answer, all at once down one column. That is a correct
 * rendering of the data and the wrong rendering of the object — a card is one
 * thing with a front and a back, and a page that shows both sides stacked is a
 * page that has quietly decided a card is a short note with two fields.
 *
 * So it is built as the object. Two faces, one at a time, and a turn between
 * them that you can see happen.
 *
 * **This is not recall-before-reveal and must not be mistaken for it.** D-003
 * is enforced by the *server*: `/api/review/due` and the card list ship no
 * `back` at all, so no amount of DOM poking finds the answer. Here the whole
 * card is already in hand — you fetched it on purpose, to read it — and the
 * flip is a way of looking at an object, not a lock on it. Anything that tests
 * you asks the server for the answer at reveal time; see `ReviewPage`.
 *
 * ## Geometry
 *
 * The two faces are stacked in **one grid cell**, not absolutely positioned.
 * Absolute faces collapse the parent to zero height and force a fixed one,
 * which either clips a long answer or leaves a short question floating in a
 * box sized for something else. Sharing a cell makes the card exactly as tall
 * as its taller side, and the height is stable across the flip — a card that
 * resizes mid-turn reads as two panels swapping, which is the impression this
 * whole component exists to avoid.
 *
 * ## Where the words come from
 *
 * The two side names are **required props**, not defaults. They were
 * `frontLabel = 'Pertanyaan'` and `backLabel = 'Jawaban'` — default parameters,
 * which is the one place copy hides from review — and they name the same two
 * sides the card editor labels, so the caller passes `cards.editor.front.label`
 * and its sibling and the peek cannot come to disagree with the editor about
 * what a side is called.
 *
 * The control under the card and the live region are `common.flashcard`, and
 * both take the side's name as a *value* rather than building a sentence out
 * of it: "Lihat jawaban" lower-cases in Indonesian and in English, and which
 * is the right transformation is a fact about the language, so it happens in
 * the catalog.
 */
export function Flashcard({
  front,
  back,
  frontLabel,
  backLabel,
  className,
}: {
  front: ReactNode
  back: ReactNode
  /** What the front is called. From the caller's catalog — see above. */
  frontLabel: string
  backLabel: string
  /** Sizing for the faces — the caller knows how much room it has. */
  className?: string
}) {
  const c = useCopy().common.flashcard
  const [face, setFace] = useState<CardFace>('front')
  const flipped = face === 'back'

  function flip() {
    setFace((f) => (f === 'front' ? 'back' : 'front'))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="perspective-distant">
        <div
          className={cn(
            'grid transform-3d',
            'transition-transform duration-(--animate-duration-flip) ease-(--ease-quiet)',
            flipped && 'rotate-y-180',
          )}
        >
          <Face
            label={frontLabel}
            hidden={flipped}
            onFlip={flip}
            className={className}
          >
            {front}
          </Face>
          <Face
            label={backLabel}
            back
            hidden={!flipped}
            onFlip={flip}
            className={className}
          >
            {back}
          </Face>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/*
          The card's own surface flips too, but a click target is not a control:
          this button is what the keyboard and a screen reader get, so it names
          the side you are going *to* rather than the gesture. "Balik kartu"
          would be honest about the mechanism and useless about the outcome.
        */}
        <Button variant="secondary" size="sm" onClick={flip}>
          <FlipHorizontal2 />
          {c.showSide(flipped ? frontLabel : backLabel)}
        </Button>

        <FaceDots flipped={flipped} />

        {/*
          The flip is a visual event, and the face that arrives is announced by
          nothing else: both faces are in the DOM the whole time, so there is no
          insertion for a reader to pick up. Politely, so it waits its turn
          rather than interrupting whatever is being read.
        */}
        <p aria-live="polite" className="sr-only">
          {c.side(flipped ? backLabel : frontLabel)}
        </p>
      </div>
    </div>
  )
}

/**
 * One side of the card.
 *
 * `inert` is doing real work: the hidden face is turned away from the viewer
 * but is still in the DOM, so without it a keyboard tab lands on a link on the
 * back of a card the user is looking at the front of, and a screen reader reads
 * the answer to a question it has not read out yet.
 */
function Face({
  label,
  back,
  hidden,
  onFlip,
  className,
  children,
}: {
  label: string
  /** The reverse: rotated out of view and tinted a step down from the front. */
  back?: boolean
  hidden: boolean
  onFlip: () => void
  className?: string
  children: ReactNode
}) {
  /*
   * The face is a click target, not a control — the button under the card is
   * the control (a <button> cannot contain the links markdown may render, and
   * `role="button"` on a div that holds prose is a worse lie than no role).
   * Two things it must not swallow:
   */
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    // A link in an answer is a link. Notes and cards carry source URLs (D-013).
    if ((event.target as HTMLElement).closest('a')) return
    // Selecting the answer to copy it ends in a click on the card, and turning
    // it over at that moment destroys the selection and the intent with it.
    if (window.getSelection()?.isCollapsed === false) return
    onFlip()
  }

  return (
    <div
      // Both faces occupy the same cell, so the card is as tall as its taller
      // side and does not resize mid-turn.
      className={cn(
        'col-start-1 row-start-1 flex min-h-48 cursor-pointer flex-col gap-4',
        'rounded-xl border border-border px-5 py-5 backface-hidden',
        'transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
        // No shadow: the system is border-first, and a card lying on a panel is
        // not floating above it — it is set *into* it, which is what these two
        // fills say. Neither is `card`: this sits inside a peek panel and
        // inside a dialog, both of which are `bg-card` themselves, so a card
        // face painted `card` is a rectangle of border and nothing else, in
        // both themes. `surface` is the page's own tone and `muted` a step
        // past it, so the two sides differ from their container and from each
        // other. Neither is tinted with the accent, which in this palette means
        // "selected", nor with anything that could read as a verdict on the
        // answer (D-054).
        //
        // Hover moves the border and not the fill, because there is no fill a
        // step below `muted` for the back face to move to: `border` and `input`
        // are the same value in light, and `muted` and `secondary` are the same
        // value in dark, so every neutral pairing is invisible in one theme or
        // the other. The accent line is legible in both.
        'hover:border-primary-ink',
        back ? 'rotate-y-180 bg-muted' : 'bg-surface',
        className,
      )}
      onClick={handleClick}
      inert={hidden}
    >
      <span className="text-xs font-medium text-subtle-fg">{label}</span>

      {/* Centred, so a three-word answer sits on the card rather than at the
          top of a box mostly full of air. A long one simply fills it. */}
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </div>
  )
}

/** Which of the two sides is showing. Two dots say it without a sentence. */
function FaceDots({ flipped }: { flipped: boolean }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      <Dot active={!flipped} />
      <Dot active={flipped} />
    </span>
  )
}

function Dot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'size-1.5 rounded-full transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
        active ? 'bg-primary-ink' : 'bg-border',
      )}
    />
  )
}
