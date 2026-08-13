import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DomainBadge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { CategoryChips } from '../../components/ui/category'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Flashcard } from '../../components/ui/flashcard'
import { MarkdownInline } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import { PeekPanel, type PeekMode } from '../../components/ui/peek-panel'
import { Loading } from '../../components/ui/spinner'
import { humanDay } from '../../lib/date'
import { useAllCategories } from '../categories/queries'
import { useAllDomains } from '../domains/queries'
import { useCard, useDeleteCard } from './queries'

/**
 * A card, previewed over the list — as a card, with two sides.
 *
 * It used to be the note peek with different labels: the question, a rule, the
 * answer, both at once down one column. Nothing was wrong with the data it
 * showed and everything was wrong with what it said the thing *was* — a card
 * read as a short note with two fields, which is exactly the shape D-055 spent
 * a migration getting away from.
 *
 * It shows the answer at all, and that is not a hole in D-003. Recall before
 * reveal governs being *tested* — the review screen and a set run — and it is
 * enforced on the server, which ships no `back` with a prompt. This is the
 * management screen: you opened this card on purpose to see what it says, and
 * the flip is a way of handling the object rather than a lock on it. The
 * *list* still withholds the answer, which is where an accidental glance would
 * actually happen.
 */
export function CardPeek({
  cardId,
  mode,
  onClose,
}: {
  cardId: string
  /** Decided by the view toggle, not by a preference of its own. */
  mode: PeekMode
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
      title="Kartu"
    >
      {isPending && <Loading />}
      {error && <Notice>{error.message}</Notice>}

      {card && (
        <article className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            {domain && <DomainBadge color={domain.color} label={domain.label} />}
            <CategoryChips ids={card.categoryIds} categories={categories} />
            <span className="ml-auto text-xs text-subtle-fg">
              {humanDay(card.updatedAt)}
            </span>
          </div>

          {/*
            Keyed by the card, so clicking the next row in the list hands you a
            new card question-side up. Without it the state survives the swap
            and the second card opens already answered — which is the one thing
            a flashcard must never do, even on a screen that is not testing you.

            Taller in a modal than in the column: the grid view has the whole
            page to give it, and a card floating in the middle of a 42rem dialog
            at the height of a list row reads as a fragment of something.
          */}
          <Flashcard
            key={card.id}
            className={mode === 'center' ? 'min-h-64' : undefined}
            front={
              // The question carries the page's full ink; the answer sits at
              // reading weight, the way prose does everywhere else. Markdown
              // maps every paragraph to `reading-fg` on its own, so the front
              // says otherwise explicitly.
              <MarkdownInline className="text-reading [&_p]:text-card-fg">
                {card.front}
              </MarkdownInline>
            }
            back={
              <MarkdownInline className="text-reading">{card.back}</MarkdownInline>
            }
          />

          {/*
            Edit and delete together, because the peek is where you decide what
            a card is for: you opened it to check whether this is the one, and
            "no, and it should go" is as common an answer as "yes, edit it".
            Making that require opening the editor first is a trip for nothing.

            Deleting closes the panel — the card it was showing has left the
            list underneath, and a preview of something no longer there is a
            dead end.

            Pushed away from the card rather than sharing the article's gap.
            One of these deletes it, and a destructive button sitting a line's
            breath under the thing it destroys is one the eye can reach before
            the brain does.
          */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
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
        description="Kartu pindah ke Terhapus. Jadwal dan riwayat ulangannya tetap utuh. Kartu yang pernah kamu ulang bisa dikembalikan kapan saja; yang belum pernah, selama 30 hari."
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
