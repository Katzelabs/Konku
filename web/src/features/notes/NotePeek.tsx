import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DomainBadge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { CategoryChips } from '../../components/ui/category'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Markdown } from '../../components/ui/markdown'
import { Notice } from '../../components/ui/notice'
import { PeekPanel, type PeekMode } from '../../components/ui/peek-panel'
import { Loading } from '../../components/ui/spinner'
import { humanDay } from '../../lib/date'
import { useAllCategories } from '../categories/queries'
import { useAllDomains } from '../domains/queries'
import { useDeleteNote, useNote } from './queries'

/**
 * A note, previewed over the list.
 *
 * Read-only on purpose. The peek answers "is this the one I meant?", and the
 * answer is usually no — making it editable would mean autosave firing on a
 * panel you opened to glance at, which is how a stray keystroke ends up in a
 * note you never intended to touch. Editing is one click away.
 */
export function NotePeek({
  noteId,
  mode,
  onModeChange,
  onClose,
}: {
  noteId: string
  mode: Exclude<PeekMode, 'full'>
  onModeChange: (m: PeekMode) => void
  onClose: () => void
}) {
  const { data: note, isPending, error } = useNote(noteId)
  const { data: domains } = useAllDomains()
  const { data: categories } = useAllCategories()
  const remove = useDeleteNote()

  const [confirming, setConfirming] = useState(false)

  const domain = domains?.find((d) => d.id === note?.domainId)

  return (
    <PeekPanel
      open
      onOpenChange={(v) => !v && onClose()}
      mode={mode}
      onModeChange={onModeChange}
      fullPageTo={`/notes/${noteId}`}
      title={note?.title || 'Catatan'}
    >
      {isPending && <Loading />}
      {error && <Notice>{error.message}</Notice>}

      {note && (
        <article className="flex flex-col gap-5">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {domain && <DomainBadge color={domain.color} label={domain.label} />}
              <CategoryChips ids={note.categoryIds} categories={categories} />
              <span className="ml-auto text-xs text-subtle-fg">
                {humanDay(note.updatedAt)}
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-card-fg">
              {note.title || 'Tanpa judul'}
            </h1>
          </header>

          {note.contentMd.trim() ? (
            <Markdown>{note.contentMd}</Markdown>
          ) : (
            <p className="text-sm text-subtle-fg">Catatan ini masih kosong.</p>
          )}

          {/*
            Edit and delete together. The peek exists to answer "is this the
            one I meant?", and "no, and it should go" is as common an answer as
            "yes, edit it" — sending that through the editor first is a trip
            for nothing.

            Deleting closes the panel: the note it was showing has left the
            list underneath, and a preview of something no longer there is a
            dead end.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary" size="sm">
              <Link to={`/notes/${noteId}`}>
                <Pencil />
                Ubah catatan
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
        title="Hapus catatan ini?"
        description="Catatan pindah ke Terhapus beserta kategorinya, dan bisa dikembalikan kapan saja."
        confirmLabel="Hapus"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(noteId, {
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
