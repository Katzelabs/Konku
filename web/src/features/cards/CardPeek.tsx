import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DomainBadge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { CategoryChips } from '../../components/ui/category'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { MarkdownInline } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import { PeekPanel, type PeekMode } from '../../components/ui/peek-panel'
import { Separator } from '../../components/ui/separator'
import { Loading } from '../../components/ui/spinner'
import { useAllCategories } from '../categories/queries'
import { useAllDomains } from '../domains/queries'
import { useCard, useDeleteCard } from './queries'

/**
 * A card, previewed over the list.
 *
 * It shows the answer, and that is not a hole in D-003. Recall before reveal
 * governs being tested — the review screen and an exam sitting. This is the
 * management screen: you opened this card on purpose to see what it says, and
 * hiding the answer behind a second click here would be ceremony, not a
 * safeguard. The *list* still withholds it, which is where an accidental
 * glance would actually happen.
 */
export function CardPeek({
  cardId,
  mode,
  onModeChange,
  onClose,
}: {
  cardId: string
  mode: Exclude<PeekMode, 'full'>
  onModeChange: (m: PeekMode) => void
  onClose: () => void
}) {
  const { data: card, isPending, error } = useCard(cardId)
  const { data: domains } = useAllDomains()
  const { data: categories } = useAllCategories()
  const remove = useDeleteCard()

  const [confirming, setConfirming] = useState(false)

  const domain = domains?.find((d) => d.id === card?.domainId)

  return (
    <PeekPanel
      open
      onOpenChange={(v) => !v && onClose()}
      mode={mode}
      onModeChange={onModeChange}
      fullPageTo={`/cards/${cardId}`}
      title="Kartu"
    >
      {isPending && <Loading />}
      {error && <Notice>{error.message}</Notice>}

      {card && (
        <article className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            {domain && <DomainBadge color={domain.color} label={domain.label} />}
            <CategoryChips ids={card.categoryIds} categories={categories} />
          </div>

          <section className="flex flex-col gap-2">
            <span className="text-xs font-medium text-subtle-fg">Pertanyaan</span>
            <MarkdownInline className="text-reading text-card-fg">
              {card.front}
            </MarkdownInline>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <span className="text-xs font-medium text-subtle-fg">Jawaban</span>
            <MarkdownInline className="text-reading text-reading-fg">
              {card.back}
            </MarkdownInline>
          </section>

          {/*
            Edit and delete together, because the peek is where you decide what
            a card is for: you opened it to check whether this is the one, and
            "no, and it should go" is as common an answer as "yes, edit it".
            Making that require opening the editor first is a trip for nothing.

            Deleting closes the panel — the card it was showing has left the
            list underneath, and a preview of something no longer there is a
            dead end.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary" size="sm">
              <Link to={`/cards/${cardId}`}>
                <Pencil />
                Ubah kartu
              </Link>
            </Button>

            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => setConfirming(true)}
            >
              <Trash2 />
              Hapus
            </Button>
          </div>

          {remove.isError && <Notice>{remove.error.message}</Notice>}
        </article>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Hapus kartu ini?"
        description="Kartu pindah ke Terhapus. Jadwal dan riwayat ulangannya tetap utuh, jadi bisa dikembalikan kapan saja."
        confirmLabel="Hapus"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(cardId, {
            onSuccess: () => {
              setConfirming(false)
              onClose()
            },
          })
        }
      />
    </PeekPanel>
  )
}
