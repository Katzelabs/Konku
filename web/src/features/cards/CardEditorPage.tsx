import { useEffect, useState } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { CategoryPicker } from '../../components/ui/category'
import {
  DetailsDrawer,
  DetailsDrawerTrigger,
  DetailsField,
} from '../../components/ui/details-drawer'
import { MarkdownInline } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import { Loading } from '../../components/ui/spinner'
import { Textarea } from '../../components/ui/textarea'
import { ToggleGroupItem } from '../../components/ui/toggle-group'
import { useMediaQuery } from '../../lib/use-media-query'
import { useCategories, useCreateCategory } from '../categories/queries'
import { useDomains } from '../domains/queries'
import {
  useCard,
  useCreateCard,
  useDeleteCard,
  useUpdateCard,
} from './queries'

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
  const [detailsOpen, setDetailsOpen] = useState(false)

  const wide = useMediaQuery('(min-width: 1024px)')
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
      create.mutate(input, { onSuccess: (c) => navigate(`/cards/${c.id}`, { replace: true }) })
    } else {
      update.mutate(input)
    }
  }

  if (!creating && isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  return (
    <div className="flex gap-0">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
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
            <DetailsDrawerTrigger onClick={() => setDetailsOpen((v) => !v)} />
          </div>
        </div>

        {saveError && <Notice>{saveError.message}</Notice>}

        <Card className="flex flex-col gap-6 px-4 py-5 md:px-5">
          <Side
            label="Pertanyaan"
            value={front}
            onChange={setFront}
            placeholder="Apa itu prior?"
          />
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
          <div className="flex justify-end">
            {/*
              Soft delete on the server: the schedule and the review history
              stay, so this is recoverable rather than final. Still the only
              destructive control here, so it is the only one that gets the
              destructive variant (D-054).
            */}
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(id as string, { onSuccess: () => navigate('/cards') })
              }
            >
              <Trash2 />
              Hapus kartu
            </Button>
          </div>
        )}
      </div>

      <DetailsDrawer
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        docked={wide}
        title="Detail"
      >
        {/*
          A card carries its own domain now. It used to inherit one from the
          note it was parsed out of, which is why exam draws and this page's
          filter both needed cards.domain_id before note_id could go.
        */}
        <DetailsField label="Domain">
          <div className="flex flex-wrap gap-2">
            <ToggleGroupItem selected={domainId === null} onClick={() => setDomainId(null)}>
              Tanpa domain
            </ToggleGroupItem>
            {(domains ?? []).map((d) => (
              <ToggleGroupItem
                key={d.id}
                selected={domainId === d.id}
                onClick={() => setDomainId(d.id)}
                className="inline-flex items-center gap-1.5"
              >
                <DomainDot color={d.color} />
                {d.label}
              </ToggleGroupItem>
            ))}
          </div>
        </DetailsField>

        <DetailsField label="Kategori">
          <CategoryPicker
            categories={categories ?? []}
            selected={categoryIds}
            creating={createCategory.isPending}
            onChange={setCategoryIds}
            onCreate={(label) => createCategory.mutateAsync(label).catch(() => null)}
          />
        </DetailsField>
      </DetailsDrawer>
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="min-h-28 resize-y font-mono text-sm leading-relaxed"
      />
      {value.trim() && (
        <div className="rounded-md border border-border bg-muted px-3 py-2">
          <MarkdownInline className="text-sm text-card-fg">{value}</MarkdownInline>
        </div>
      )}
    </div>
  )
}
