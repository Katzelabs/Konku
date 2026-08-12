import { useEffect, useState } from 'react'
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
import { useCategories, useCreateCategory } from '../categories/queries'
import { useDomains } from '../domains/queries'
import { useCard, useCreateCard, useDeleteCard, useUpdateCard } from './queries'

/**
 * Create, edit and view one card.
 *
 * Explicit save, not autosave. A note is a draft you keep adding to, so losing
 * a keystroke there matters more than a stray write; a card is a small, final
 * pair of fields that feeds the review queue, and half-typed questions
 * shouldn't start showing up in tomorrow's due list.
 */
export default function CardEditorPage() {
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

  const { data: domains } = useDomains()
  const { data: categories } = useCategories()
  const createCategory = useCreateCategory()

  useEffect(() => {
    if (!card || loaded) return
    setFront(card.front)
    setBack(card.back)
    setDomainId(card.domainId)
    setCategoryIds(card.categoryIds)
    setLoaded(true)
  }, [card, loaded])

  const pending = create.isPending || update.isPending
  const saveError = create.error ?? update.error
  const valid = front.trim() !== '' && back.trim() !== ''

  function submit() {
    const input = { front: front.trim(), back: back.trim(), domainId, categoryIds }
    if (creating) {
      create.mutate(input, {
        onSuccess: (c) => navigate(`/cards/${c.id}`, { replace: true }),
      })
    } else {
      update.mutate(input)
    }
  }

  if (!creating && isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="link" size="inline">
          <Link to="/cards">
            <ArrowLeft />
            Kartu
          </Link>
        </Button>

        <div className="ml-auto flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={submit} disabled={!valid || pending}>
            {pending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </div>

      {saveError && <Notice>{saveError.message}</Notice>}

      <Card className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {/* Same shape as the note editor: properties first, then the content. */}
        <PropertyBar>
          <PropertyRow icon={<Folder className="size-3.5" />} label="Domain">
            <DomainProperty domains={domains} value={domainId} onChange={setDomainId} />
          </PropertyRow>
          <PropertyRow icon={<Tag className="size-3.5" />} label="Kategori">
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
          label="Pertanyaan"
          value={front}
          onChange={setFront}
          placeholder="Apa itu prior?"
        />

        {/* The two sides are one object but two answers to two different
            questions, and with borderless writing areas there is otherwise
            nothing to say where one ends. */}
        <Separator />

        <Side
          label="Jawaban"
          value={back}
          onChange={setBack}
          placeholder="Keyakinan awal sebelum melihat data."
        />

        <p className="text-xs text-subtle-fg">
          Kedua sisi mendukung markdown, termasuk beberapa baris dan blok kode.
        </p>
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
            Hapus kartu
          </Button>

          {remove.isError && <Notice>{remove.error.message}</Notice>}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Hapus kartu ini?"
        description="Kartu pindah ke Terhapus. Jadwal dan riwayat ulangannya tetap utuh. Kartu yang pernah kamu ulang bisa dikembalikan kapan saja; yang belum pernah, selama 30 hari."
        confirmLabel="Hapus"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(id as string, { onSuccess: () => navigate('/cards') })
        }
      />
    </div>
  )
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
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-subtle-fg">{label}</span>
      <Textarea
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
