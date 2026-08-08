// Hand-written mirrors of the Go structs. OpenAPI codegen is deliberately
// skipped: real setup cost to solve a drift problem that does not exist at
// roughly eight endpoints (D-040).

/**
 * A domain's uuid. Not a slug union any more: domains became per-user rows the
 * user can create and rename (D-046), so the set is not known at compile time.
 * The slug survives on the row for seeding and stable references.
 */
export type DomainId = string

export interface Domain {
  id: DomainId
  slug: string
  label: string
  color: string
  weeklyQuota: number
  sortOrder: number
  /** Set once archived. Archived domains stay out of pickers but still label history (D-051). */
  archivedAt: string | null
}

/**
 * A label shared by notes and cards (D-055).
 *
 * Not a domain: a domain is one per item, drives the weekly rota and exam
 * draws, and carries a colour. A category is many per item and means nothing
 * to the scheduler. It has no colour on purpose — see CategoryChip.
 */
export interface Category {
  id: string
  slug: string
  label: string
  /** Archived categories leave the picker but keep labelling history (D-051). */
  archivedAt: string | null
  noteCount: number
  cardCount: number
}

export interface Note {
  id: string
  title: string
  contentMd: string
  domainId: DomainId | null
  categoryIds: string[]
  createdAt: string
  updatedAt: string
}

/**
 * The list shape. It carries no markdown on purpose — the list screen shows a
 * title, a date and its labels, and shipping every note's full text to render
 * that is pure waste.
 *
 * `cardCount` is gone with D-055: a note no longer contains cards.
 */
export interface NoteSummary {
  id: string
  title: string
  domainId: DomainId | null
  categoryIds: string[]
  updatedAt: string
}

export type CardType = 'basic' | 'cloze' | 'feynman'
export type Rating = 'ingat' | 'lupa'

/**
 * What the review screen receives before reveal.
 *
 * `back` is intentionally absent: recall before reveal is mandatory (D-003),
 * and the server must not ship the answer alongside the prompt.
 */
export interface DueCard {
  id: string
  type: CardType
  front: string
}

/**
 * A card, in full. Cards are their own resource with their own CRUD (D-055);
 * they used to exist only as `Q :: A` lines inside a note.
 *
 * Both sides are markdown and may span lines.
 */
export interface Card {
  id: string
  front: string
  back: string
  type: CardType
  domainId: DomainId | null
  categoryIds: string[]
  createdAt: string
  updatedAt: string
}

/**
 * The list shape, and the candidate list when pinning a fixed exam's
 * questions.
 *
 * `back` is absent, and that is the D-003 guarantee held one level below the
 * review screen: if every answer shipped with every list, recall-before-reveal
 * would be one dev-tools glance from defeat on a page visited daily. The
 * editor fetches a single card when it needs the answer.
 */
export interface CardSummary {
  id: string
  front: string
  type: CardType
  domainId: DomainId | null
  categoryIds: string[]
  createdAt: string
  updatedAt: string
}

export interface DueList {
  cards: DueCard[]
  /** How many are due in all, before the daily cap (D-009). */
  total: number
}

/** Returned only after the user has chosen to reveal. */
export interface CardAnswer {
  back: string
}

export interface RatingResult {
  stage: number
  state: 'learning' | 'mastered'
  /** Null once mastered: the card is no longer scheduled. */
  nextReviewDate: string | null
}

export interface FocusSession {
  id: string
  domainId: DomainId | null
  durationMinutes: number
  /** Local YYYY-MM-DD, never a UTC timestamp. */
  sessionDate: string
  completedAt: string
}

/**
 * How an exam picks its questions (D-048).
 *
 * `fixed` pins a card set, so two attempts compare like for like. `random`
 * draws afresh each sitting — better practice, non-comparable scores.
 */
export type ExamSelection = 'fixed' | 'random'

export interface Exam {
  id: string
  title: string
  description: string
  domainId: DomainId | null
  selection: ExamSelection
  /** Only set when selection is 'random'. */
  questionCount: number | null
  timeLimitMinutes: number | null
  attemptCount: number
  createdAt: string
}

export interface Attempt {
  id: string
  examId: string
  startedAt: string
  /** Null while the attempt is still in progress. */
  finishedAt: string | null
  /** Local YYYY-MM-DD, like a focus session's date. */
  attemptDate: string
  totalCount: number
  correctCount: number
}

/** A card in a fixed exam's pinned set. Prompt only. */
export interface CardRef {
  cardId: string
  front: string
}

export interface ExamDetail extends Exam {
  attempts: Attempt[]
  /** The pinned set. Empty for a 'random' exam, which draws per attempt. */
  cards: CardRef[]
}

/**
 * One question in a sitting.
 *
 * `back` is absent for the same reason it is absent from DueCard: recall
 * before reveal is mandatory (D-003) and the answer arrives only when asked
 * for.
 */
export interface AttemptQuestion {
  position: number
  cardId: string
  front: string
  /** Set once answered, which is what makes an attempt resumable (D-050). */
  rating: Rating | null
  /** The card was deleted after the attempt began. It still counts. */
  missing: boolean
}

export interface AttemptDetail extends Attempt {
  questions: AttemptQuestion[]
}
