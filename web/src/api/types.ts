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
 * Still not a domain. A domain is exactly one per item and drives the weekly
 * rota and exam draws; a category is many per item and means nothing to the
 * scheduler. What no longer separates them is colour: categories got one in
 * 00011, along with the management screen that made it necessary. The
 * confetti D-054 was worried about is held off in `CategoryChip`, which wears
 * the colour as a dot rather than as a fill.
 */
export interface Category {
  id: string
  slug: string
  label: string
  /** #RRGGBB, picked in Pengaturan. User data, like a domain's. */
  color: string
  /** Archived categories leave the picker but keep labelling history (D-051). */
  archivedAt: string | null
  noteCount: number
  cardCount: number
}

/**
 * What a bulk delete or restore answers with.
 *
 * `count` is the rows that actually changed, which is not always the size of
 * the selection: an id that was already deleted, or that names nothing this
 * user owns, does not match. That is not an error — "delete these twelve" is
 * satisfied when one had already gone — but the screen reports the number, so
 * it has to be the true one.
 */
export interface BulkResult {
  count: number
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

/**
 * One page of an index list (D-084).
 *
 * `total` is how many rows match the filters in all, not how many are in
 * `items` — the screens render it as the count, and rendering `items.length`
 * there is what told an account with 300 notes that it had 50. Both `/notes`
 * and `/cards` answer with this; the settings lists still answer with a bare
 * array, because a person's domains and categories are bounded by what they
 * will sit down and create.
 */
export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
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
 * How a review set picks its questions (D-048).
 *
 * `fixed` pins a card set, so two runs compare like for like. `random` draws
 * afresh each sitting — better practice, non-comparable scores.
 */
export type SetSelection = 'fixed' | 'random'

/**
 * How a review set asks its questions (D-076).
 *
 * `recall` is the Anki shape: prompt, reveal, judge yourself. `choice` offers
 * four options and grades on the server. This is a property of the set, not of
 * the card — the same card is free recall in one set and multiple choice in
 * another, which is why `CardType` stays out of it.
 */
export type SetFormat = 'recall' | 'choice'

export interface ReviewSet {
  id: string
  title: string
  description: string
  selection: SetSelection
  /** Only set when selection is 'random'. */
  questionCount: number | null
  timeLimitMinutes: number | null
  format: SetFormat
  /** Empty means the set draws from the whole knowledge base. */
  domainIds: DomainId[]
  categoryIds: string[]
  /** Finished runs only. */
  runCount: number
  archived: boolean
  createdAt: string
}

export interface Run {
  id: string
  setId: string
  startedAt: string
  /** Null while the run is still in progress. */
  finishedAt: string | null
  /** Local YYYY-MM-DD, like a focus session's date. */
  runDate: string
  totalCount: number
  correctCount: number
}

/** A card in a fixed set's pinned questions. Prompt only. */
export interface CardRef {
  cardId: string
  front: string
}

export interface ReviewSetDetail extends ReviewSet {
  /**
   * The sitting in progress, or null.
   *
   * The finished ones are a paged list of their own at
   * `/review/sets/{id}/runs` — they used to be embedded here, twenty at a time,
   * with no way to ask for the twenty-first. The open run stays on the detail
   * because "is there one to resume" must not depend on which page of history
   * happens to be loaded.
   */
  openRun: Run | null
  /** The pinned set. Empty for a 'random' set, which draws per run. */
  cards: CardRef[]
}

/**
 * One question in a sitting.
 *
 * `back` is absent for the same reason it is absent from DueCard: recall
 * before reveal is mandatory (D-003) and the answer arrives only when asked
 * for. For a choice question the options are present but which one is right is
 * not — grading happens on the server.
 */
export interface RunQuestion {
  position: number
  cardId: string
  front: string
  /** Set once answered, which is what makes a run resumable (D-050). */
  rating: Rating | null
  /**
   * Empty for a recall question, and for a choice question the draw could not
   * find enough distinct distractors for — that one falls back to recall.
   */
  options: string[]
  /** The card was deleted after the run began. It still counts. */
  missing: boolean
}

export interface RunDetail extends Run {
  questions: RunQuestion[]
}

/** What comes back from answering. A choice question reveals here. */
export interface AnswerResult {
  rating: Rating
  back: string | null
  correctIndex: number | null
}
