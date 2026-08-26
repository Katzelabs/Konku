import { pluralFor } from '../../plural'
import type { CategoriesCopy } from './types'

const n = pluralFor('en')

/** English — translated from `id.ts`, same claims in the same order. */
export const categories: CategoriesCopy = {
  // Category → category is the one noun in this slice that translates without
  // an argument. Domain does not, and `domains/en.ts` says why.
  title: 'Categories',
  description:
    'One vocabulary shared by notes and cards. You usually make them as you write — this is where you tidy them up.',

  noun: 'Category',

  add: 'Add',

  empty: {
    title: 'No categories yet.',
    description: 'A category appears here as soon as you add one to a note or a card.',
  },

  archivedHeading: 'Archived',

  form: {
    label: 'Category name',
    placeholder: 'Linear algebra',
    save: 'Save',
    cancel: 'Cancel',
    renameNote: 'A new name applies to every note and card that uses it.',
  },

  row: {
    used: (notes, cards) =>
      `${n(notes, { one: '# note', other: '# notes' })} · ${n(cards, { one: '# card', other: '# cards' })}`,
    unused: 'not used yet',
    edit: 'Edit',
    archive: 'Archive',
    // The exact inverse of the Archive button that stands in its place, so it
    // is written as that word's opposite. The Indonesian names the outcome
    // ("make it active again"); English has a one-word pair and the row is
    // three link buttons wide, where the shorter word is the clearer one.
    unarchive: 'Unarchive',
    delete: 'Delete',
  },
}
