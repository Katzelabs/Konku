import { pluralFor } from '../../plural'
import type { ReviewCopy } from './types'

const n = pluralFor('en')

/** Two numbers in one sentence cannot both be `#`. See the note in `id.ts`. */
const num = new Intl.NumberFormat('en')

/**
 * English — translated from `id.ts`, same claims in the same order.
 *
 * Ulangan → **Review**, Latihan → **Practice**. A saved *latihan* is a
 * **practice set**, because the object is countable in English and "practice"
 * alone is not; the section that holds them is **Practice**.
 *
 * This file is where rule 6 is easiest to break. Every string below counts
 * something, and English will happily turn a count into a shortfall. There is
 * no target in this feature: "The rest tomorrow." is the whole of what the
 * day's cap has to say, and "Done for today." does not congratulate anybody.
 */
export const review: ReviewCopy = {
  title: 'Review',
  description:
    'Cards scheduled for today, plus practice you put together yourself.',

  due: {
    title: "Today's review",
    none: 'Nothing to review today.',
    ready: (count) =>
      n(count, { one: '# card ready to review.', other: '# cards ready to review.' }),
    // The whole of what the cap has to say. No "you still have", no button to
    // override it — the cap is the feature (D-009).
    restTomorrow: 'The rest tomorrow.',
    start: 'Start',
    done: 'Done for today.',
    toNotes: 'To notes',
  },

  answering: {
    position: (current, total) => `${num.format(current)} of ${num.format(total)}`,
    reveal: 'Show answer',
    revealing: 'Opening…',
    // "Belum ingat" is "not remembered yet", and the *yet* is the load-bearing
    // half: it says the card is on its way rather than failed. "Not yet" keeps
    // it. Anything built on "forgot", "wrong" or "missed" does not.
    notYet: 'Not yet',
    remembered: 'Remembered',
    editCard: 'Edit this card',
  },

  sets: {
    title: 'Practice',
    description:
      'Put it together yourself: how many questions, which domains and categories, multiple choice or free recall. The result does not change the schedule above.',
    create: 'Create practice set',
    empty: {
      title: 'No saved practice sets yet.',
      description:
        'Make one if you want to test yourself outside the schedule, or focus on a single topic.',
    },
    loadMore: (remaining) =>
      n(remaining, {
        one: 'Load more (# practice set left)',
        other: 'Load more (# practice sets left)',
      }),
  },

  summary: {
    randomQuestions: (count) =>
      n(count, { one: '# random question', other: '# random questions' }),
    fixedQuestions: 'fixed questions',
    choice: 'multiple choice',
    // "Free recall" rather than "recall on your own": it is the ordinary
    // English name for exactly this, it is two words like the Indonesian, and
    // it pairs cleanly with "multiple choice". It describes the *set* — the
    // same card is free recall in one and multiple choice in another (D-076).
    recall: 'free recall',
    runCount: (count) => n(count, { one: 'done # time', other: 'done # times' }),
  },

  newSet: {
    titleLabel: 'Practice set title',
    titlePlaceholder: 'Linear algebra practice',
    formatLegend: 'Question format',
    recallOption: 'Free recall — see the question, try to remember, then open the answer',
    choiceOption: 'Multiple choice — four options, graded automatically',
    choiceNote:
      'The wrong options are taken from the backs of your other cards. Recognising an answer is easier than recalling it, so the number is naturally higher.',
    // Singular, as in the Indonesian: the legend names the property being
    // filtered on, which a card has one of.
    domainLegend: 'Domain',
    domainHint: 'Leave empty to draw from all.',
    categoryLegend: 'Category',
    categoryHint: 'Combined with domain: a card must match both.',
    selectionLegend: 'Questions',
    randomOption: 'Random each time you run it',
    fixedOption: 'Fixed — the same questions every time, so the scores can be compared',
    countLabel: 'Number of questions',
    fixedHint: "Once saved, pick the cards on this practice set's page.",
    save: 'Save',
    cancel: 'Cancel',
  },

  set: {
    back: 'All reviews',
    start: 'Start',
    // "Resume", not "Continue": the server returns the same run with the same
    // questions and the same options (D-050), which is what resuming means.
    resume: 'Resume',
    openRun: 'There is an unfinished attempt.',
    archive: 'Archive',
    delete: 'Delete',
    picker: {
      loading: 'Loading cards…',
      title: 'Questions',
      chosen: (chosen, total) =>
        `${num.format(chosen)} selected of ${num.format(total)}`,
      empty: 'No cards to choose from yet. Make a few cards first.',
      save: 'Save question list',
      loadMore: (remaining) =>
        n(remaining, {
          one: 'Load more (# card left)',
          other: 'Load more (# cards left)',
        }),
    },
    history: {
      title: 'History',
      // "Belum pernah dikerjakan." — literally "never been done". Said with
      // this screen's own noun, because a bare "Not done yet" would read as
      // the *open* attempt two paragraphs above rather than as an empty list.
      empty: 'No attempts yet.',
      loadMore: (remaining) =>
        n(remaining, {
          one: 'Load more (# attempt left)',
          other: 'Load more (# attempts left)',
        }),
    },
  },

  run: {
    finished: {
      title: 'Finished answering',
      description: 'Every question has been answered.',
      action: 'See result',
    },
    position: (current, total) =>
      `Question ${num.format(current)} of ${num.format(total)}`,
    missingCard: 'This card no longer exists.',
    skip: 'Skip',
    correct: 'Correct.',
    // "Belum kena" is gentle and deliberately not "salah". English keeps that:
    // it points at the answer rather than naming the pick wrong.
    incorrect: 'Not that one — the answer is marked.',
    next: 'Next',
    result: {
      title: 'Result',
      noScheduleChange: 'This does not change the review schedule of these cards.',
      // "Yang belum nempel" — the ones that have not stuck yet. The metaphor
      // survives translation intact, and with it the absence of blame.
      missedTitle: 'Not stuck yet',
      back: 'Back to the practice set',
    },
  },
}
