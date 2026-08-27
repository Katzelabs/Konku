import { pluralFor } from '../../plural'
import type { NotesCopy } from './types'

const n = pluralFor('en')

/** English — translated from `id.ts`, same claims in the same order. */
export const notes: NotesCopy = {
  untitled: 'Untitled',

  index: {
    title: 'Notes',
    description: 'Write first, tidy up later.',
    count: (count) => n(count, { one: '# note', other: '# notes' }),
    // The whole button label now, not a noun for `load-more.tsx` to build a
    // sentence around — which is what made an English reader see an English
    // noun inside an Indonesian one. "left" is the remainder, stated: a count
    // of what the list still holds, not a tally of what is owed (hard rule 6).
    loadMore: (remaining) =>
      n(remaining, {
        one: 'Load more (# note left)',
        other: 'Load more (# notes left)',
      }),
    newNote: 'New note',
    // Terhapus → Deleted. Decided, and not a per-screen call — see the table in
    // `i18n/en.ts`. "Trash" would import a discarded-and-gone metaphor, and
    // D-069 is thirty days and recoverable, which is the opposite claim.
    openDeleted: 'Deleted',
    search: {
      // "judul" is titles, and the search really is titles only (D-084). The
      // English must not quietly widen it to "Search notes…".
      placeholder: 'Search titles…',
      label: 'Search notes',
    },
    pickOne: 'Pick a note to read it here.',
    empty: {
      title: 'No notes yet.',
      description: 'Start with a single line.',
    },
    noMatch: 'No title matches.',
    select: (title) => `Select ${title}`,
  },

  deleted: {
    title: 'Deleted',
    // "restored for 30 days" and "permanently deleted" are the words
    // `i18n/legal/en.ts` already uses for this same guarantee. One promise
    // stated in two vocabularies is how a policy and a dialog stop agreeing.
    // The semicolon carries the Indonesian's comma splice without adding a
    // clause English did not have.
    description: (days) =>
      `Notes you have deleted. They can be restored for ${n(days, {
        one: '# day',
        other: '# days',
      })}; after that they are permanently deleted.`,
    back: 'Back to notes',
    empty: {
      title: 'No deleted notes.',
      description: 'Notes you delete will appear here.',
    },
    restore: 'Restore',
    restoring: 'Restoring…',
  },

  undo: {
    moved: (count) =>
      n(count, { one: '# note moved to Deleted.', other: '# notes moved to Deleted.' }),
    action: 'Undo',
  },

  delete: {
    action: 'Delete',
    titleOne: 'Delete this note?',
    titleMany: (count) => n(count, { one: 'Delete # note?', other: 'Delete # notes?' }),
    // Plural, because Indonesian "Catatan" is number-neutral here and one
    // dialog serves both the single delete and a selection. English has to
    // choose a number, and the plural is the one that is not wrong for either.
    description: (days) =>
      `Notes move to Deleted with their categories, and can be restored for ${n(days, {
        one: '# day',
        other: '# days',
      })}.`,
  },

  peek: {
    // Singular: this names one note. `index.title` is the same Indonesian word
    // — "Catatan" — naming the screen, and English has to split them.
    fallbackTitle: 'Note',
    emptyBody: 'This note is still empty.',
    edit: 'Edit note',
  },

  editor: {
    back: 'Notes',
    save: 'Save',
    domain: 'Domain',
    category: 'Category',
    title: {
      label: 'Note title',
      placeholder: 'Title',
    },
    body: {
      label: 'Note body',
      placeholder: 'Write here…',
    },
    mode: {
      write: 'Write',
      split: 'Split',
      preview: 'Preview',
    },
    previewEmpty: 'The preview appears here.',
    delete: 'Delete note',
    status: {
      // Not alarming and not a dead end: the text is still in the box and
      // another attempt is already scheduled. "Not saved yet" rather than
      // "Unsaved" or "Failed to save" — the first is a state, the second two
      // are a verdict.
      retrying: 'Not saved yet, trying again…',
      saving: 'Saving…',
      unsaved: 'Not saved yet',
      saved: 'Saved',
    },
  },
}
