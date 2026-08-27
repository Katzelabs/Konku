import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { ColorPicker } from './color-picker'
import { ConfirmDialog } from './confirm-dialog'
import { Flashcard } from './flashcard'
import { LoadMore } from './load-more'
import { PasswordInput } from './password-input'
import { SelectionBar } from './selection-bar'
import { Loading } from './spinner'
import { ViewToggle } from './view-toggle'
import { LocaleProvider, loadCatalog } from '../../i18n'

/*
 * The shared components render the reader's language (ticket 11 I5).
 *
 * `check-i18n` is the other mechanism (hard rule 9) and it proves a different
 * thing: that no *literal* is left in this folder. It cannot prove that a
 * component reads the right key, or that it reads the catalog at all — a
 * component importing `id` directly, or reaching for a key that happens to
 * hold an Indonesian word, passes that check and ships an English reader a
 * screen in Indonesian. That is precisely the failure this slice existed to
 * fix, and it was invisible for the length of the whole ticket: the baseline
 * said zero while every screen still rendered Indonesian, because the scan
 * did not cover this folder.
 *
 * So this asserts the English, from the components that had the copy in them.
 */

// `LocaleProvider` refuses to switch to a locale whose chunk is not in memory —
// Indonesian is the fallback and never a network request (hard rule 8) — so
// the English catalog is loaded once before anything renders here, exactly as
// `main.tsx` does before `createRoot`.
beforeAll(async () => {
  await loadCatalog('en')
})

function inEnglish(ui: React.ReactNode) {
  return render(<LocaleProvider locale="en">{ui}</LocaleProvider>)
}

describe('the shared components in English', () => {
  it('spins with a label rather than a default parameter', () => {
    inEnglish(<Loading />)

    // The label was `label = 'Memuat…'`, a default parameter — the one place
    // copy hides from review — and ten call sites take the default.
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })

  it('lets the caller write the whole load-more sentence', () => {
    inEnglish(
      <LoadMore
        loaded={50}
        total={62}
        hasMore
        loading={false}
        onLoadMore={() => {}}
        remainingLabel={(n) => `Load more (${n} notes left)`}
      />,
    )

    // Exactly what the caller returned, with nothing wrapped around it. The
    // component used to build `${remaining} ${noun} lagi` itself, which put an
    // English noun inside an Indonesian sentence however well the catalogs
    // were translated — and gave English no way to agree with the count.
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('Load more (12 notes left)')
    expect(button.textContent).not.toMatch(/Muat|lagi/)
  })

  it('counts a selection through the catalog', () => {
    inEnglish(
      <SelectionBar
        count={3}
        allSelected={false}
        onToggleAll={() => {}}
        onClear={() => {}}
        partial
      >
        <span />
      </SelectionBar>,
    )

    expect(screen.getByText('3 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    // `partial` is the list having pages nobody has loaded (D-084): the box
    // reaches the rows on screen and the label says so rather than promising
    // the whole collection.
    expect(
      screen.getByRole('checkbox', { name: 'Select all loaded' }),
    ).toBeInTheDocument()
  })

  it('says something true while a confirm is in flight', () => {
    inEnglish(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Delete note"
        description="It moves to Deleted."
        confirmLabel="Delete"
        pending
        onConfirm={() => {}}
      />,
    )

    // Not "Deleting…", which this component used to assert whatever the
    // caller's `confirmLabel` said the action was.
    expect(screen.getByRole('button', { name: 'One moment…' })).toBeInTheDocument()
  })

  it('names the reveal toggle by its action', () => {
    inEnglish(<PasswordInput />)

    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })

  it('names the view toggle and both of its buttons', () => {
    inEnglish(<ViewToggle mode="list" onChange={() => {}} />)

    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'List view' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grid view' })).toBeInTheDocument()
  })

  it('names a swatch by its hex, which is not a translated word', () => {
    inEnglish(<ColorPicker value="#4F7CAC" onChange={() => {}} />)

    expect(screen.getByText('Colour')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Colour #4F7CAC' })).toBeInTheDocument()
  })

  it('turns a card over without calling it a test', () => {
    inEnglish(
      <Flashcard
        frontLabel="Question"
        backLabel="Answer"
        front={<p>What is a prior?</p>}
        back={<p>A starting belief.</p>}
      />,
    )

    // The control names the side you are going *to*, lower-cased by the
    // catalog rather than by the component — which of `toLowerCase` and
    // leaving it alone is right is a fact about the language.
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument()
    // D-080: this is an object being turned over, never a reveal.
    expect(screen.getByText('Card side: Question')).toBeInTheDocument()
  })
})

describe('the fallback', () => {
  it('renders Indonesian for a locale whose catalog never arrived', () => {
    // Hard rule 8: Indonesian is the source language and the fallback, so a
    // chunk that does not arrive is a page in Indonesian and never a blank one.
    // Every component above goes through `useCopy`, so one of them proves it
    // for all of them.
    render(
      <LocaleProvider locale={'de' as never}>
        <Loading />
      </LocaleProvider>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Memuat…')
  })
})
