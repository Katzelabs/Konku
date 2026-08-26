import { pluralFor } from '../../plural'
import type { CardsCopy } from './types'

const n = pluralFor('en')

/** English — translated from `id.ts`, same claims in the same order. */
export const cards: CardsCopy = {
  index: {
    title: 'Cards',
    // "reviewed on the review screen" is the known cost of Ulangan → Review,
    // accepted in `en.ts`'s header rather than worked around here.
    description: 'One question, one answer. Written here, reviewed on the review screen.',
    count: (count) => n(count, { one: '# card', other: '# cards' }),
    // Plural and lower case: `LoadMore` interpolates the remainder in front of
    // it and the sentence around it is still Indonesian. See the note in
    // `types.ts` — the component's own copy is not this slice's to convert.
    listNoun: 'cards',
    startReview: 'Start review',
    newCard: 'New card',
    search: {
      placeholder: 'Search card text…',
      label: 'Search cards',
    },
    selectCard: 'Select this card',
    placeholder: 'Pick a card to see what it says.',
    empty: {
      title: 'No cards yet.',
      description: 'One question you want to remember is enough to start.',
    },
    noMatch: 'No cards match.',
    delete: 'Delete',
  },

  deleted: {
    // Deleted, not Trash. Terhapus literally means deleted, and D-069 is
    // thirty days and recoverable — the opposite of what a bin implies.
    title: 'Deleted',
    description:
      'Cards you have deleted. They come back with their review history intact. A card that has never been reviewed is removed permanently after 30 days.',
    back: 'Back to cards',
    empty: {
      title: 'No deleted cards.',
      description: 'Cards you delete will appear here.',
    },
    undo: {
      moved: (count) =>
        n(count, { one: '# card moved to Deleted.', other: '# cards moved to Deleted.' }),
      action: 'Undo',
    },
    restore: 'Restore',
    restoring: 'Restoring…',
  },

  confirmDelete: {
    one: 'Delete this card?',
    many: (count) => n(count, { one: 'Delete # card?', other: 'Delete # cards?' }),
    // Both windows survive: indefinite for a card that was ever reviewed,
    // thirty days for one that was not. The second half is written as "an
    // unreviewed one" rather than "a card you have not reviewed" — the fact
    // belongs to the card, and English turns that clause into a reproach far
    // more readily than Indonesian does (hard rule 6).
    description:
      'The card moves to Deleted. Its schedule and review history stay intact. A card you have reviewed can be restored at any time; an unreviewed one, for 30 days.',
    confirm: 'Delete',
  },

  peek: {
    title: 'Card',
    edit: 'Edit card',
    delete: 'Delete',
  },

  editor: {
    save: 'Save',
    saving: 'Saving…',
    // States which of the two states the screen is in, because leaving saves.
    // Not "unsaved changes" and not a warning — it goes away on its own.
    unsaved: 'Not saved yet',
    front: {
      label: 'Question',
      placeholder: 'What is a prior?',
    },
    back: {
      label: 'Answer',
      placeholder: 'An initial belief, before looking at the data.',
    },
    markdownHint: 'Both sides support markdown, including multiple lines and code blocks.',
    delete: 'Delete card',
  },
}
