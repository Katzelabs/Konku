import { useState } from 'react'
import { ChevronRight, Plus, Repeat } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReviewSet, SetFormat, SetSelection } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { LoadMore } from '../../components/ui/load-more'
import { Notice } from '../../components/ui/notice'
import { PageHeader } from '../../components/ui/page-header'
import { Loading } from '../../components/ui/spinner'
import { useCopy } from '../../i18n'
import { useCategories } from '../categories/queries'
import { useDomains } from '../domains/queries'
import { useDueCards } from './queries'
import { useCreateReviewSet, useReviewSets } from './setQueries'

/**
 * Ulangan, which is now one screen with two ways in (D-075).
 *
 * The scheduled queue comes first and is the default action. That ordering is
 * the point of the merge: the automatic queue is what answers "cepat paham
 * tapi cepat lupa", and it only works if it is the thing you land on rather
 * than something you have to choose to configure. Saved sets sit underneath as
 * extra practice.
 */
export default function ReviewHomePage() {
  const c = useCopy().review
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={c.title} description={c.description} />

      <DueToday />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-surface-fg">{c.sets.title}</h2>
            <p className="mt-0.5 text-sm text-subtle-fg">{c.sets.description}</p>
          </div>
          {!adding && (
            <Button variant="secondary" onClick={() => setAdding(true)} className="shrink-0">
              <Plus />
              {c.sets.create}
            </Button>
          )}
        </div>

        {adding && <NewSetForm onDone={() => setAdding(false)} />}

        <SetList adding={adding} />
      </section>
    </div>
  )
}

/**
 * The due queue, as the first thing on the page.
 *
 * The count is stated and nothing else — no target, no percentage, no streak.
 * There is nothing here to fall short of (D-009, D-054).
 */
function DueToday() {
  const c = useCopy().review.due
  const { data, isPending, error } = useDueCards()

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  const total = data?.total ?? 0
  const ready = data?.cards.length ?? 0

  return (
    <Card className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-card-fg">{c.title}</h2>
        <p className="mt-1 text-sm text-subtle-fg">
          {total === 0 ? c.none : c.ready(ready)}
          {total > ready && ` ${c.restTomorrow}`}
        </p>
      </div>
      {ready > 0 && (
        <Button asChild variant="primary" size="lg" className="shrink-0">
          <Link to="/review/due">
            <Repeat />
            {c.start}
          </Link>
        </Button>
      )}
    </Card>
  )
}

function SetList({ adding }: { adding: boolean }) {
  const c = useCopy().review.sets
  const {
    sets,
    total,
    isPending,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useReviewSets()

  if (isPending) return <Loading />
  // Only a first page that never arrived is nothing to show. A failed later
  // page keeps its rows and reports itself under the list instead.
  if (error && sets.length === 0) return <Notice>{error.message}</Notice>

  if (sets.length === 0 && !adding) {
    return <EmptyState title={c.empty.title} description={c.empty.description} />
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {sets.map((s) => (
          <SetRow key={s.id} set={s} />
        ))}
      </ul>

      <LoadMore
        loaded={sets.length}
        total={total}
        hasMore={Boolean(hasNextPage)}
        loading={isFetchingNextPage}
        error={error}
        onLoadMore={() => fetchNextPage()}
        noun={c.noun}
      />
    </div>
  )
}

function SetRow({ set }: { set: ReviewSet }) {
  const c = useCopy().review.summary
  const { data: domains } = useDomains()
  const picked = domains?.filter((d) => set.domainIds.includes(d.id)) ?? []

  return (
    <li>
      <Link to={`/review/sets/${set.id}`} className="block">
        <Card className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-card-fg">{set.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-subtle-fg">
              {set.selection === 'random'
                ? c.randomQuestions(set.questionCount ?? 0)
                : c.fixedQuestions}
              <span aria-hidden>·</span>
              {set.format === 'choice' ? c.choice : c.recall}
              {picked.map((d) => (
                <span key={d.id} className="flex items-center gap-1">
                  <span aria-hidden>·</span>
                  <DomainDot color={d.color} />
                  {d.label}
                </span>
              ))}
              {set.runCount > 0 && ` · ${c.runCount(set.runCount)}`}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-subtle-fg" />
        </Card>
      </Link>
    </li>
  )
}

function NewSetForm({ onDone }: { onDone: () => void }) {
  const c = useCopy().review.newSet
  const { data: domains } = useDomains()
  const { data: categories } = useCategories()
  const create = useCreateReviewSet()

  const [title, setTitle] = useState('')
  const [selection, setSelection] = useState<SetSelection>('random')
  const [format, setFormat] = useState<SetFormat>('recall')
  const [questionCount, setQuestionCount] = useState(10)
  const [domainIds, setDomainIds] = useState<string[]>([])
  const [categoryIds, setCategoryIds] = useState<string[]>([])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    create.mutate(
      {
        title: title.trim(),
        selection,
        format,
        questionCount: selection === 'random' ? questionCount : null,
        timeLimitMinutes: null,
        domainIds,
        categoryIds,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="set-title">{c.titleLabel}</Label>
          <Input
            id="set-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={c.titlePlaceholder}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-surface-fg">
            {c.formatLegend}
          </legend>
          <label className="flex items-start gap-2 text-sm text-secondary-fg">
            <input
              type="radio"
              checked={format === 'recall'}
              onChange={() => setFormat('recall')}
              className="mt-0.5 accent-primary"
            />
            {c.recallOption}
          </label>
          <label className="flex items-start gap-2 text-sm text-secondary-fg">
            <input
              type="radio"
              checked={format === 'choice'}
              onChange={() => setFormat('choice')}
              className="mt-0.5 accent-primary"
            />
            {c.choiceOption}
          </label>
          {format === 'choice' && (
            // Said plainly rather than buried: recognising an answer among
            // four is easier than recalling it, and the user should know that
            // is what they picked (D-077).
            <p className="mt-1 text-xs text-muted-fg">{c.choiceNote}</p>
          )}
        </fieldset>

        <FilterPicker
          legend={c.domainLegend}
          hint={c.domainHint}
          options={domains?.map((d) => ({ id: d.id, label: d.label })) ?? []}
          selected={domainIds}
          onChange={setDomainIds}
        />

        <FilterPicker
          legend={c.categoryLegend}
          hint={c.categoryHint}
          options={categories?.map((cat) => ({ id: cat.id, label: cat.label })) ?? []}
          selected={categoryIds}
          onChange={setCategoryIds}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-surface-fg">
            {c.selectionLegend}
          </legend>
          <label className="flex items-start gap-2 text-sm text-secondary-fg">
            <input
              type="radio"
              checked={selection === 'random'}
              onChange={() => setSelection('random')}
              className="mt-0.5 accent-primary"
            />
            {c.randomOption}
          </label>
          <label className="flex items-start gap-2 text-sm text-secondary-fg">
            <input
              type="radio"
              checked={selection === 'fixed'}
              onChange={() => setSelection('fixed')}
              className="mt-0.5 accent-primary"
            />
            {c.fixedOption}
          </label>
        </fieldset>

        {selection === 'random' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-count">{c.countLabel}</Label>
            <Input
              id="set-count"
              type="number"
              min={1}
              max={100}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="w-24"
            />
          </div>
        )}

        {selection === 'fixed' && (
          <p className="text-xs text-muted-fg">{c.fixedHint}</p>
        )}

        {create.isError && <Notice>{create.error.message}</Notice>}

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || !title.trim()}
          >
            {c.save}
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            {c.cancel}
          </Button>
        </div>
      </form>
    </Card>
  )
}

/** A multi-select as checkboxes. Nothing checked means no filter. */
function FilterPicker({
  legend,
  hint,
  options,
  selected,
  onChange,
}: {
  legend: string
  hint: string
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  if (options.length === 0) return null

  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
    )
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-surface-fg">{legend}</legend>
      <p className="text-xs text-muted-fg">{hint}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
        {options.map((o) => (
          <label
            key={o.id}
            className="flex items-center gap-2 text-sm text-secondary-fg"
          >
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              onChange={() => toggle(o.id)}
              className="accent-primary"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
