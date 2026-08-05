// Hand-written mirrors of the Go structs. OpenAPI codegen is deliberately
// skipped: real setup cost to solve a drift problem that does not exist at
// roughly eight endpoints (D-040).

export type DomainId = 'general' | 'math' | 'psychology' | 'music' | 'coding'

export interface Domain {
  id: DomainId
  label: string
  color: string
  weeklyQuota: number
}

export interface Note {
  id: string
  title: string
  contentMd: string
  domainId: DomainId | null
  createdAt: string
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

/** Returned only after the user has chosen to reveal. */
export interface CardAnswer {
  back: string
}

export interface FocusSession {
  id: string
  domainId: DomainId | null
  durationMinutes: number
  /** Local YYYY-MM-DD, never a UTC timestamp. */
  sessionDate: string
  completedAt: string
}
