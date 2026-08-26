import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Category } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { COLOR_PALETTE, ColorPicker } from '../../components/ui/color-picker'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Notice } from '../../components/ui/notice'
import { Loading } from '../../components/ui/spinner'
import { useCopy } from '../../i18n'
import { cn } from '../../lib/utils'
import {
  useAllCategories,
  useArchiveCategory,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from './queries'

/**
 * Category management, the same shape as DomainSettings.
 *
 * Categories were the one piece of user vocabulary with no screen behind it.
 * They are created by typing a name into a note or a card — which is the right
 * way to create one, and hard rule 7 is why — but that meant a list that only
 * ever grew: a typo became a permanent second category, and nothing could be
 * renamed, recoloured, retired or removed. This is where that is repaired.
 *
 * Note what is deliberately *not* here: creating one. Sending someone to
 * Pengaturan to define a label before they are allowed to apply it is exactly
 * the friction create-on-type exists to avoid, so the button below is a
 * convenience for tidying, not the front door.
 */
export default function CategorySettings() {
  const c = useCopy().categories
  const { data, isPending, error } = useAllCategories()
  const [adding, setAdding] = useState(false)

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  const live = (data ?? []).filter((c) => c.archivedAt === null)
  const archived = (data ?? []).filter((c) => c.archivedAt !== null)

  return (
    <div className="flex flex-col gap-4">
      {/* The explanation lives in the section description now — same as
          DomainSettings, so the two label screens stay the same shape. */}
      {!adding && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            {c.add}
          </Button>
        </div>
      )}

      {adding && <NewCategoryForm onDone={() => setAdding(false)} />}

      {live.length === 0 && !adding && (
        <EmptyState
          title={c.empty.title}
          description={c.empty.description}
        />
      )}

      {live.length > 0 && (
        <ul className="flex flex-col gap-2">
          {live.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-fg">{c.archivedHeading}</h3>
          <ul className="flex flex-col gap-2">
            {archived.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function NewCategoryForm({ onDone }: { onDone: () => void }) {
  const c = useCopy().categories
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(COLOR_PALETTE[0])
  const create = useCreateCategory()
  const update = useUpdateCategory()

  // Two calls, because create-on-type takes a label and nothing else — the
  // endpoint deliberately refuses to recolour an existing category, since the
  // picker inside an editor posts to it on every unfamiliar word. Here the
  // colour was chosen on purpose, so it is applied straight after.
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    const created = await create.mutateAsync(label.trim()).catch(() => null)
    if (!created) return
    if (created.color !== color) {
      await update.mutateAsync({ id: created.id, color }).catch(() => null)
    }
    onDone()
  }

  const pending = create.isPending || update.isPending

  return (
    <Card className="border-primary-ink">
      <form onSubmit={submit} className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-category">{c.form.label}</Label>
          <Input
            id="new-category"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={c.form.placeholder}
          />
        </div>

        <ColorPicker value={color} onChange={setColor} />

        {create.isError && <Notice>{create.error.message}</Notice>}

        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={pending || !label.trim()}>
            {c.form.save}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onDone}>
            {c.form.cancel}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function CategoryRow({ category }: { category: Category }) {
  const c = useCopy().categories
  const [editing, setEditing] = useState(false)
  const archive = useArchiveCategory()
  const del = useDeleteCategory()
  const isArchived = category.archivedAt !== null

  if (editing) {
    return <EditCategoryForm category={category} onDone={() => setEditing(false)} />
  }

  const used = category.noteCount + category.cardCount

  return (
    <li>
      <Card className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <DomainDot color={category.color} />
          <span
            className={cn(
              'flex-1 text-sm font-medium',
              isArchived ? 'text-subtle-fg' : 'text-card-fg',
            )}
          >
            {category.label}
          </span>
          {/*
            The counts the API already returns, said plainly. They are the
            answer to "can I delete this?" — and they are why the Hapus below
            may come back 409 — so showing them turns a refusal into something
            the user saw coming.
          */}
          <span className="text-xs text-subtle-fg">
            {used === 0
              ? c.row.unused
              : c.row.used(category.noteCount, category.cardCount)}
          </span>
        </div>

        <div className="flex gap-3">
          {!isArchived && (
            <Button variant="link" size="inline" onClick={() => setEditing(true)}>
              {c.row.edit}
            </Button>
          )}
          <Button
            variant="link"
            size="inline"
            onClick={() => archive.mutate({ id: category.id, archived: !isArchived })}
          >
            {isArchived ? c.row.unarchive : c.row.archive}
          </Button>
          <Button variant="link" size="inline" onClick={() => del.mutate(category.id)}>
            {c.row.delete}
          </Button>
        </div>

        {/*
          A category in use cannot be deleted — the server answers 409 with a
          message pointing at archiving (D-051). Shown as-is: it is already
          user-facing Indonesian, and it is information, not a telling-off.
        */}
        {del.isError && <Notice>{del.error.message}</Notice>}
        {archive.isError && <Notice>{archive.error.message}</Notice>}
      </Card>
    </li>
  )
}

function EditCategoryForm({
  category,
  onDone,
}: {
  category: Category
  onDone: () => void
}) {
  const c = useCopy().categories
  const [label, setLabel] = useState(category.label)
  const [color, setColor] = useState(category.color)
  const update = useUpdateCategory()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    update.mutate({ id: category.id, label: label.trim(), color }, { onSuccess: onDone })
  }

  return (
    <li>
      <Card className="border-primary-ink">
        <form onSubmit={submit} className="flex flex-col gap-4 p-4">
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label={c.form.label}
          />
          <ColorPicker value={color} onChange={setColor} />

          {/*
            Renaming follows everywhere the label was applied, because there is
            one row behind all of them — which is the whole reason categories
            are rows rather than strings on a note.
          */}
          <p className="text-xs text-subtle-fg">{c.form.renameNote}</p>

          {update.isError && <Notice>{update.error.message}</Notice>}

          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={update.isPending}>
              {c.form.save}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onDone}>
              {c.form.cancel}
            </Button>
          </div>
        </form>
      </Card>
    </li>
  )
}
