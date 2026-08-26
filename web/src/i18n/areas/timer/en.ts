import { pluralFor } from '../../plural'
import type { TimerCopy } from './types'

const n = pluralFor('en')

/** See the note in `id.ts`: the second number in `log.showing` needs this. */
const num = new Intl.NumberFormat('en')

/** English — translated from `id.ts`, same claims in the same order. */
export const timer: TimerCopy = {
  // The same word in both languages, and kept as a key rather than left in the
  // screen so it stays with the rest of this area's copy.
  title: 'Timer',
  description:
    'Sessions with a clear start and end. When the session ends, you are asked what you just learned.',

  status: {
    idle: 'Ready',
    running: 'Running',
    paused: 'Paused',
    done: 'Done',
  },

  controls: {
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    // "Ulangi" is the ordinary word for doing something again. "Reset" is the
    // short, plain word English uses for a clock going back to the top, and
    // carries none of the "you did it wrong, go again" that "Start over" can.
    reset: 'Reset',
  },

  duration: 'Duration',
  // The progressive-focus promise stated as a fact about the app, not as a
  // target for the reader (D-009: there is no target).
  durationHint: 'Start short. The duration goes up on its own once short sessions are a habit.',
  domain: 'Domain',
  noDomain: 'No domain',

  minutes: (count) => n(count, { one: '# minute', other: '# minutes' }),

  summary: {
    title: 'This session',
    endsAround: 'Ends around',
  },

  // "belum" is "not yet", and it is the half that matters: the record is
  // missing, the session is still on screen, and the retry beside this is what
  // the sentence is for. Not "failed to save", which reads as lost.
  logFailed: 'The session has not been recorded yet.',
  retry: 'Try again',

  capture: {
    // A plain question, and it stays one. Not "What did you take away?", not
    // "Anything you learned?" — the Indonesian is four ordinary words and the
    // English is four ordinary words.
    title: 'What did you learn?',
    description: 'One line is enough.',
    placeholder: 'One line is enough.',
    cardHint: 'Write a card as',
    // The words either side of `::` are placeholders in the example, so they
    // translate; the separator is parser syntax and does not.
    cardSyntax: 'Question :: Answer',
    skip: 'Skip',
    save: 'Save',
    saving: 'Saving…',
  },

  log: {
    title: 'Recent sessions',
    sessions: (count) => n(count, { one: '# session', other: '# sessions' }),
    empty: {
      title: 'No sessions recorded yet.',
      description: 'Finished sessions appear here.',
    },
    // "Showing", not "Only showing": the second is an apology for a limit that
    // is deliberate, and there is nothing under this line to press.
    showing: (shown, total) =>
      n(shown, { one: `Showing the last # session of ${num.format(total)}.`, other: `Showing the last # sessions of ${num.format(total)}.` }),
  },
}
