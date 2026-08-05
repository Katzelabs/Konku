import { Link, useNavigate } from 'react-router-dom'
import { humanDay } from '../../lib/date'
import { useCreateNote, useNotes } from './queries'

export default function NoteListPage() {
  const { data: notes, isPending, error } = useNotes()
  const create = useCreateNote()
  const navigate = useNavigate()

  function newNote() {
    create.mutate(
      { contentMd: '' },
      { onSuccess: (note) => navigate(`/notes/${note.id}`) },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Catatan</h1>
        <button
          onClick={newNote}
          disabled={create.isPending}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {create.isPending ? 'Sebentar…' : 'Catatan baru'}
        </button>
      </div>

      {isPending && <p className="text-sm text-slate-500">Memuat…</p>}

      {error && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{error.message}</p>
      )}

      {notes && notes.length === 0 && (
        /*
         * An empty library is a starting point, not a failure. No illustration
         * of a sad box, no "you haven't written anything yet" — the copy just
         * says what to do next and makes it small (GOALS.md).
         */
        <div className="rounded-lg bg-slate-50 px-4 py-6 text-slate-600">
          <p>Belum ada catatan.</p>
          <p className="mt-1 text-sm text-slate-500">Mulai dari satu baris saja.</p>
        </div>
      )}

      {notes && notes.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate-100">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                to={`/notes/${note.id}`}
                className="flex items-baseline justify-between gap-4 py-3 hover:bg-slate-50"
              >
                <span className="truncate font-medium text-slate-800">{note.title}</span>
                <span className="shrink-0 text-sm text-slate-400">
                  {note.cardCount > 0 && <span className="mr-3">{note.cardCount} kartu</span>}
                  {humanDay(note.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
