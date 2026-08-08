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

export interface Note {
  id: string
  title: string
  contentMd: string
  domainId: DomainId | null
  createdAt: string
  updatedAt: string
}

/**
 * The list shape. It carries no markdown on purpose — the list screen shows a
 * title, a date and a card count, and shipping every note's full text to
 * render that is pure waste.
 */
export interface NoteSummary {
  id: string
  title: string
  domainId: DomainId | null
  cardCount: number
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
  noteId: string
  type: CardType
  front: string
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

/** A card in a fixed exam's pinned set, or a candidate for it. Prompt only. */
export interface CardRef {
  noteId: string
  cardId: string
  front: string
}

export interface PickableCard extends CardRef {
  noteTitle: string
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
  noteId: string
  cardId: string
  front: string
  /** Set once answered, which is what makes an attempt resumable (D-050). */
  rating: Rating | null
  /** The card's note was deleted after the attempt began. It still counts. */
  missing: boolean
}

export interface AttemptDetail extends Attempt {
  questions: AttemptQuestion[]
}
