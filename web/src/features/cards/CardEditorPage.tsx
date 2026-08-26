import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Folder, Tag, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { MarkdownInline } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import {
  CategoryProperty,
  DomainProperty,
  PropertyBar,
  PropertyRow,
} from '../../components/ui/property'
import { Separator } from '../../components/ui/separator'
import { Loading } from '../../components/ui/spinner'
import { Textarea } from '../../components/ui/textarea'
import { useCopy } from '../../i18n'
import { useFlushOnHide } from '../../lib/useFlushOnHide'
import type { Card as CardRow } from '../../api/types'
import { useCategories, useCreateCategory } from '../categories/queries'
import { useDomains } from '../domains/queries'
import type { CardInput } from './queries'
import { useCard, useCreateCard, useDeleteCard, useUpdateCard } from './queries'

/**
 * Create, edit and view one card.
 *
 * Explicit save, not autosave. A note is a draft you keep adding to, so losing
 * a keystroke there matters more than a stray write; a card is a small, final
 * pair of fields that feeds the review queue, and half-typed questions
 * shouldn't start showing up in tomorrow's due list.
 *
 * That reasoning survives, but it used to be the whole of the design, and the
 * screen therefore threw away everything typed into it the moment you clicked
 * the back link — silently, which is the one failure this product exists to
 * prevent. It now keeps what you wrote when the screen leaves, when the tab is
 * backgrounded, and when the tab closes, on one condition: **both sides are
 * filled in**. That is what keeps the original argument intact. A card with a
 * question and an answer is a card, and saving it puts nothing in the due list
 * that the person did not write; a card with one side empty is still being
 * composed, cannot be saved by the server anyway, and is left alone.
 */
export default function CardEditorPage() {
  const copy = useCopy()
  const c = copy.cards
  const { id } = useParams()
  const creating = id === undefined
  const navigate = useNavigate()

  const { data: card, isPending, error } = useCard(creating ? '' : id)

  const create = useCreateCard()
  const update = useUpdateCard(id ?? '')
  const remove = useDeleteCard()

  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [domainId, setDomainId] = useState<string | null>(null)
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(creating)
  const [confirming, setConfirming] = useState(false)

  // Set the moment a delete succeeds, so the save-on-unmount below does not
  // fire a write at a card that has just gone. Same guard, and same reason, as
  // the note editor's.
  const removed = useRef(false)

  const { data: domains } = useDomains()
  const { data: categories } = useCategories()
  const createCategory = useCreateCategory()

  // What the server currently holds, so "dirty" is a fact rather than a guess.
  // A new card starts from empty, which makes the first character typed dirty.
  const saved = useRef({
    front: '',
    back: '',
    domainId: null as string | null,
    categoryIds: [] as string[],
  })

  const adopt = (c: CardRow) => {
    saved.current = {
      front: c.front,
      back: c.back,
      domainId: c.domainId,
      categoryIds: c.categoryIds,
    }
  }

  useEffect(() => {
    if (!card || loaded) return
    setFront(card.front)
    setBack(card.back)
    setDomainId(card.domainId)
    setCategoryIds(card.categoryIds)
    adopt(card)
    setLoaded(true)
  }, [card, loaded])

  const pending = create.isPending || update.isPending
  const saveError = create.error ?? update.error
  const valid = front.trim() !== '' && back.trim() !== ''

  // What a save would send. Trimmed, because that is what goes to the server —
  // comparing untrimmed state against a trimmed response would leave a card
  // permanently dirty over a space at the end of a line.
  const input: CardInput = {
    front: front.trim(),
    back: back.trim(),
    domainId,
    categoryIds,
  }

  const dirty =
    loaded &&
    (input.front !== saved.current.front ||
      input.back !== saved.current.back ||
      input.domainId !== saved.current.domainId ||
      !sameIds(categoryIds, saved.current.categoryIds))

  /**
   * Writes the card.
   *
   * `andGo` is only false on unmount, where navigating a route that is already
   * being torn down does nothing. Everywhere else it must be true, and for a
   * new card that is load-bearing rather than cosmetic: the navigation is what
   * moves the screen off `/cards/new`, and until it happens `creating` is still
   * true and the next save would POST a *second* card instead of patching the
   * first.
   */
  const persist = useCallback(
    (andGo: boolean) => {
      if (creating) {
        create.mutate(input, {
          onSuccess: (c) => {
            adopt(c)
            // `replace`, so the browser back button still goes to /cards
            // rather than to the empty new-card form.
            if (andGo) navigate(`/cards/${c.id}`, { replace: true })
          },
        })
      } else {
        update.mutate(input, { onSuccess: adopt })
      }
      // The four fields rather than `input`, which is a fresh object on every
      // render: these are what it is built from, so the list is exact.
    },
    [front, back, domainId, categoryIds, creating, create, update, navigate],
  )

  const submit = () => persist(true)

  const latest = useRef({ dirty, valid, persist, input })
  latest.current = { dirty, valid, persist, input }

  // Leaving mid-edit saves rather than warning, the same call the note editor
  // makes. A React cleanup covers SPA navigation only, which is the back link
  // and the sidebar; useFlushOnHide below covers the tab.
  useEffect(
    () => () => {
      if (removed.current) return
      if (latest.current.dirty && latest.current.valid) latest.current.persist(false)
    },
    [],
  )

  useFlushOnHide({
    // The page is hidden, not gone: it will very likely be looked at again, so
    // this takes the ordinary route including the navigation.
    onHidden: () => {
      if (removed.current || !latest.current.dirty || !latest.current.valid) return
      latest.current.persist(true)
    },
    // Only an existing card, and deliberately so. The keepalive path cannot
    // read a response, so it cannot tell whether the write landed — and a
    // creation sent twice is two cards, where a PATCH sent twice is one row
    // written twice. Creating a card while the tab is hidden is left to
    // `onHidden` above, which goes through the mutation and therefore knows.
    pending: () =>
      creating || removed.current || !latest.current.dirty || !latest.current.valid
        ? null
        : { path: `/cards/${id}`, method: 'PATCH', body: latest.current.input },
  })

  if (!creating && isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="link" size="inline">
          <Link to="/cards">
            <ArrowLeft />
            {/* The screen this goes back to, named by its own title. */}
            {c.index.title}
          </Link>
        </Button>

        <div className="ml-auto flex items-center gap-3">
          {/*
            Stated because leaving now saves: the screen should say which of
            the two states it is in rather than let you find out afterwards.
            It is a fact, not a nag — no colour, no icon, and it goes away on
            its own (hard rule 6).
          */}
          <SaveStatus dirty={dirty} valid={valid} pending={pending} />
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={!valid || !dirty || pending}
          >
            {pending ? c.editor.saving : c.editor.save}
          </Button>
        </div>
      </div>

      {saveError && <Notice>{saveError.message}</Notice>}

      <Card className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {/* Same shape as the note editor: properties first, then the content. */}
        <PropertyBar>
          {/*
            The two property labels are the *other* features' nouns, read from
            their own catalogs rather than restated here. A screen showing both
            does not make either string a cards string (ticket 11 I5).
          */}
          <PropertyRow icon={<Folder className="size-3.5" />} label={copy.domains.noun}>
            <DomainProperty domains={domains} value={domainId} onChange={setDomainId} />
          </PropertyRow>
          <PropertyRow icon={<Tag className="size-3.5" />} label={copy.categories.noun}>
            <CategoryProperty
              categories={categories}
              selected={categoryIds}
              creating={createCategory.isPending}
              onChange={setCategoryIds}
              onCreate={(label) => createCategory.mutateAsync(label).catch(() => null)}
            />
          </PropertyRow>
        </PropertyBar>

        <Side
          label={c.editor.front.label}
          value={front}
          onChange={setFront}
          placeholder={c.editor.front.placeholder}
        />

        {/* The two sides are one object but two answers to two different
            questions, and with borderless writing areas there is otherwise
            nothing to say where one ends. */}
        <Separator />

        <Side
          label={c.editor.back.label}
          value={back}
          onChange={setBack}
          placeholder={c.editor.back.placeholder}
        />

        <p className="text-xs text-subtle-fg">{c.editor.markdownHint}</p>
      </Card>

      {!creating && (
        <div className="flex flex-col items-end gap-2">
          {/*
            Soft delete on the server: the schedule and the review history
            stay, so this is recoverable rather than final. Still the only
            destructive control here, so it is the only one that gets the
            destructive variant (D-054).

            It asks first even though it is undoable. Deleting from the editor
            means the card you were just looking at vanishes and the screen
            navigates away — cheap to reverse, but never what a misclick on
            "Simpan" should be one pixel away from doing.
          */}
          <Button
            variant="destructive"
            size="sm"
            disabled={remove.isPending}
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
            {c.editor.delete}
          </Button>

          {remove.isError && <Notice>{remove.error.message}</Notice>}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={c.confirmDelete.one}
        description={c.confirmDelete.description}
        confirmLabel={c.confirmDelete.confirm}
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(id as string, {
            onSuccess: () => {
              removed.current = true
              navigate('/cards')
            },
          })
        }
      />
    </div>
  )
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(b)
  return a.every((id) => set.has(id))
}

/**
 * Three states, none of them an alarm. The unsaved line is only shown once
 * there is something savable — a card with one side still empty is being
 * written, not failing.
 */
function SaveStatus({
  dirty,
  valid,
  pending,
}: {
  dirty: boolean
  valid: boolean
  pending: boolean
}) {
  const c = useCopy().cards.editor

  if (pending) return <span className="text-sm text-subtle-fg">{c.saving}</span>
  if (dirty && valid) return <span className="text-sm text-subtle-fg">{c.unsaved}</span>
  return null
}

/** One side of the card: the markdown source, with its rendering under it. */
function Side({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  // The caption above the field was a <span>, which reads as a label and is
  // not one: nothing associated it with the textarea, so both sides of a card
  // were unlabelled to a screen reader (F-12). A <label htmlFor> is the same
  // pixels and also makes the caption click into the field.
  const id = useId()

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-medium text-subtle-fg">
        {label}
      </label>
      <Textarea
        id={id}
        variant="plain"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="min-h-32 font-mono text-sm"
      />
      {value.trim() && (
        <div className="rounded-md border border-border bg-muted px-3 py-2">
          <MarkdownInline className="text-sm text-card-fg">{value}</MarkdownInline>
        </div>
      )}
    </div>
  )
}
