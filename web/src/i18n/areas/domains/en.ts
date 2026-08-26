import { pluralFor } from '../../plural'
import type { DomainsCopy } from './types'

const n = pluralFor('en')

/** English — translated from `id.ts`, same claims in the same order. */
export const domains: DomainsCopy = {
  // "Domains", not "Subjects" or "Topics". See the header of `types.ts`: the
  // word is already English and is this product's own term for the thing.
  title: 'Domains',
  // "bukan setoran" is "not a deposit owed". Said here as "not something you
  // owe", which keeps the claim and keeps it off the list of ways English
  // turns a target into a debt (hard rule 6).
  description:
    'Domains tag notes and focus sessions, and they are what the weekly rotation is built on. A weekly target points a direction, it is not something you owe — zero means the domain stays usable but sits out of the rotation.',

  noun: 'Domain',

  add: 'Add',

  empty: {
    title: 'No domains yet.',
    description: 'Domains are used to tag notes and focus sessions.',
  },

  archivedHeading: 'Archived',

  form: {
    label: 'Domain name',
    placeholder: 'General knowledge',
    quota: 'Weekly target',
    save: 'Save',
    cancel: 'Cancel',
  },

  row: {
    // "3× / week" reads the same at every count, so English writes one form
    // here too. The number still goes through `Intl.NumberFormat`.
    perWeek: (count) => n(count, { other: '#× / week' }),
    outOfRotation: 'out of rotation',
    edit: 'Edit',
    archive: 'Archive',
    // Same call as the categories screen, and for the same reason: it is the
    // exact inverse of the Archive button that stands in its place.
    unarchive: 'Unarchive',
    delete: 'Delete',
  },
}
