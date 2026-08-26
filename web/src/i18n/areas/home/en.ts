import { pluralFor } from '../../plural'
import type { HomeCopy } from './types'

const n = pluralFor('en')

/** English — translated from `id.ts`, same claims in the same order. */
export const home: HomeCopy = {
  title: 'Home',
  // "cukup lanjutkan yang kemarin" is "just carry on from yesterday" — an
  // invitation, and specifically not "pick up where you left off", which
  // implies a place you stopped short of.
  description: 'Start here. No daily target — just carry on from yesterday.',

  due: {
    title: "Today's review",
    cardsUnit: (count) => n(count, { one: 'card', other: 'cards' }),
    none: 'Nothing to review today.',
    // The cap doing its job, stated flat. Not "30 still to go", not "30
    // waiting for you" — the deferred cards are not a debt (D-009).
    deferred: 'The rest tomorrow.',
    allToday: 'Everything fits today.',
    action: 'Start review',
  },

  focus: {
    title: 'Focus session',
    description: 'Start short. When the session ends, you are asked what you just learned.',
    action: 'Open the timer',
  },

  capture: {
    title: 'New note',
    description: 'One line is enough to start.',
    action: 'Write a note',
  },

  recent: {
    title: 'Recent notes',
    all: 'All notes',
    empty: {
      // "No notes yet.", never "You haven't written anything yet" — the
      // second grades an account for being new, and DESIGN.md §5 names this
      // exact pair as the example of the difference.
      title: 'No notes yet.',
      description: 'Start with a single line.',
    },
    untitled: 'Untitled',
  },

  domains: {
    // Indonesian does not mark the plural; the card lists several.
    title: 'Domains',
    manage: 'Manage',
    empty: 'No domains yet.',
    // `other` alone, and not because the form was forgotten: "×/week" is a
    // rate abbreviation and does not inflect, so "1×/week" is right.
    weekly: (count) => n(count, { other: '#×/week' }),
    // Where the domain sits, not a judgement about it. Archived domains are a
    // record that is kept on purpose (D-051).
    outOfRotation: 'not in rotation',
  },
}
