import type { PrivacySection } from './types'

/**
 * Every column the database holds, and where the privacy policy accounts for it.
 *
 * ## The hole this closes
 *
 * L9 shipped a coverage test that was a *needle list*: it asserted the policy
 * mentions email, cards, IP addresses and a dozen other things somebody had
 * thought of. That fails when a listed thing goes missing and passes silently
 * when a new thing is stored and never documented — which is the direction the
 * failure actually goes. It cannot see a new column, because a new column is
 * not on the list, and nothing makes it get on the list.
 *
 * That is not hypothetical. Migration 00013 added `users.suspended_at` — a new
 * category of fact about an account, including whether the operator has acted
 * against it and since when — and every test stayed green.
 *
 * So the list is inverted. This file enumerates the *schema*, and
 * `features/legal/legal.test.tsx` reads the columns out of
 * `internal/store/gen/models.go` and fails on any column that is not in the
 * table below. A new column is a failing test until somebody says, in writing,
 * either which part of the policy covers it or why it needs no cover.
 *
 * ## Why `models.go` is the source and not the migrations
 *
 * The migrations are the truth, but reading them means replaying `CREATE TABLE`,
 * `ADD COLUMN`, `DROP COLUMN` and `RENAME COLUMN` across an up section and a
 * down section in fourteen files — a parser with its own bugs, whose failure
 * mode is quietly seeing fewer columns than exist, which is exactly the failure
 * this test exists to prevent. sqlc has already done that replay, `make
 * sqlc-diff` fails in CI when its output drifts from the migrations, and the
 * `json:"…"` tag on every field is the column name verbatim. So the chain is:
 * migrations → `models.go` (held in step by CI) → this table → the documents.
 *
 * ## The two things an entry can say
 *
 *   - **A claim id.** The policy must, in *both* languages, make that claim in
 *     the section the claim names. That is what stops "documented" from meaning
 *     "somebody wrote a section id next to it".
 *   - **`exempt`, with a reason.** For a column that carries nothing about the
 *     person: a primary key, a foreign key to their own rows, a derived index.
 *     Write the reason. An exemption without one is indistinguishable from
 *     giving up, and it is the line a future reader has to be able to argue
 *     with.
 *
 * There is no third option and no default. A column not named here fails.
 *
 * ## What this still cannot catch
 *
 * The other direction: a claim on the page with nothing behind it. That is
 * D-092 — the policy said the backups were encrypted and they never were — and
 * no amount of coverage detects it, because there is no data to cover. Those
 * claims need their own assertions, one per claim, and `legal.test.tsx` carries
 * the ones we have.
 */

/** A key is the sqlc model, snake-cased, plus the column: `user.suspended_at`. */
export type ColumnKey = string

/**
 * A thing the policy says, and where it says it.
 *
 * The needles are per-locale substrings, matched case-insensitively against the
 * text of the named section. Short and stable on purpose: a needle that is a
 * whole sentence turns every edit to that sentence into a failing test, and a
 * test that fails for the wrong reason is a test that gets weakened.
 */
export interface Claim {
  readonly section: PrivacySection
  readonly id: string
  readonly en: string
}

export const CLAIMS = {
  accountId: { section: 'notStored', id: 'id akun', en: 'account id' },
  email: { section: 'stored', id: 'alamat email', en: 'email address' },
  name: { section: 'stored', id: 'nama depan', en: 'first name' },
  password: { section: 'stored', id: 'argon2id', en: 'argon2id' },
  accountDates: { section: 'stored', id: 'kapan akun dibuat', en: 'when the account was created' },
  verified: { section: 'stored', id: 'diverifikasi', en: 'verified' },
  suspension: { section: 'suspension', id: 'tangguh', en: 'suspend' },

  notes: { section: 'stored', id: 'catatan', en: 'notes' },
  cards: { section: 'stored', id: 'kartu', en: 'card' },
  categories: { section: 'stored', id: 'kategori', en: 'categor' },
  domains: { section: 'stored', id: 'domain', en: 'domain' },
  colour: { section: 'stored', id: 'warna', en: 'colour' },
  weeklyQuota: { section: 'stored', id: 'kuota mingguan', en: 'weekly quota' },
  sortOrder: { section: 'stored', id: 'urutan', en: 'order' },
  archived: { section: 'stored', id: 'arsip', en: 'archiv' },
  timestamps: {
    section: 'stored',
    id: 'kapan dibuat dan terakhir diubah',
    en: 'when it was created and last changed',
  },

  schedule: { section: 'stored', id: 'jadwal berikutnya', en: 'next due' },
  lapses: { section: 'stored', id: 'melupakannya', en: 'forgotten' },
  cardState: { section: 'stored', id: 'status kartunya', en: 'state' },
  reviewLog: { section: 'stored', id: 'setiap kali kamu mengulang', en: 'every time you review' },
  reviewRating: { section: 'stored', id: 'penilaianmu', en: 'how you rated' },
  interval: { section: 'stored', id: 'jarak jadwal', en: 'interval' },
  reviewSource: { section: 'stored', id: 'antrean harian', en: 'daily queue' },
  reviewFormat: { section: 'stored', id: 'pilihan ganda', en: 'multiple choice' },

  focus: { section: 'stored', id: 'sesi fokus', en: 'focus session' },
  focusDuration: { section: 'stored', id: 'berapa menit', en: 'how many minutes' },

  sets: { section: 'stored', id: 'latihan', en: 'practice set' },
  setSelection: {
    section: 'stored',
    id: 'cara kartunya dipilih',
    en: 'how the cards are chosen',
  },
  questionCount: { section: 'stored', id: 'jumlah soal', en: 'number of questions' },
  timeLimit: { section: 'stored', id: 'batas waktu', en: 'time limit' },
  runTiming: { section: 'stored', id: 'kapan dimulai', en: 'when it started' },
  runResult: { section: 'stored', id: 'berapa yang benar', en: 'how many were right' },
  choiceOptions: {
    section: 'stored',
    id: 'pilihan yang muncul di layar',
    en: 'options that appeared on screen',
  },

  loginSessions: { section: 'stored', id: 'sesi login', en: 'signed-in sessions' },
  ip: { section: 'stored', id: 'alamat ip', en: 'ip address' },
  browser: { section: 'stored', id: 'browser', en: 'browser' },
  tokens: { section: 'stored', id: 'tautan verifikasi', en: 'verification and reset links' },

  timerDuration: { section: 'stored', id: 'durasi timer', en: 'timer duration' },
  focusStep: { section: 'stored', id: 'langkah fokus', en: 'focus step' },
  rota: { section: 'stored', id: 'rotasi domain', en: 'domain rotation' },
  // On `users`, not `user_settings` -- 00014's header has the RLS argument.
  // The policy does not say which table it sits in, and should not.
  language: { section: 'stored', id: 'bahasa yang kamu pilih', en: 'the language you chose' },

  deleted: { section: 'retention', id: 'terhapus', en: 'deleted' },
  expiry: { section: 'retention', id: 'kedaluwarsa', en: 'expire' },
} as const satisfies Record<string, Claim>

export type ClaimId = keyof typeof CLAIMS

export type Coverage = ClaimId | { readonly exempt: string }

/** Reused reasons, so a hundred keys do not carry a hundred paraphrases. */
const OWN_ROW = { exempt: "The row's own identifier. Generated here, means nothing outside." } as const
const OWNER = { exempt: 'The owner. It is the account reading the policy (hard rule 4).' } as const
const LINK = { exempt: "A reference to another of the account's own rows." } as const
const BOOKKEEPING = { exempt: 'When the row was written. Not content, and not shown anywhere.' } as const

/**
 * Every column, and what accounts for it.
 *
 * Keyed by sqlc model rather than SQL table, because that is what the test can
 * read without guessing: `user` is the `users` table, `auth_session` is
 * `auth_sessions`, and a pluralisation rule is one more thing that can be
 * subtly wrong.
 */
export const SCHEMA_COVERAGE = {
  // ── The account ────────────────────────────────────────────────────────
  'user.id': 'accountId',
  'user.email': 'email',
  'user.password_hash': 'password',
  'user.created_at': 'accountDates',
  'user.email_verified_at': 'verified',
  'user.first_name': 'name',
  'user.last_name': 'name',
  // Migration 00013, ticket 10 O1. The column that made the needle list's
  // weakness concrete: it landed, it is a fact about the person's account, and
  // nothing failed. It is reversible and holds nothing but a timestamp, and the
  // policy has to say both of those things rather than only naming it.
  'user.suspended_at': 'suspension',
  'user.locale': 'language',

  'user_setting.user_id': OWNER,
  'user_setting.default_duration_minutes': 'timerDuration',
  'user_setting.focus_step_n': 'focusStep',
  'user_setting.rota_enabled': 'rota',
  'user_setting.created_at': BOOKKEEPING,
  'user_setting.updated_at': BOOKKEEPING,

  // ── Credentials ────────────────────────────────────────────────────────
  // The session id *is* the credential: it is what the cookie carries, it is
  // never rendered, and export.sql omits the whole table on purpose (07 L6).
  // Naming it in the policy would describe a value the user can never see and
  // must never be sent.
  'auth_session.id': { exempt: 'The session credential itself. Never displayed, never exported.' },
  'auth_session.user_id': OWNER,
  'auth_session.expires_at': 'expiry',
  'auth_session.created_at': 'loginSessions',
  'auth_session.last_seen_at': 'loginSessions',
  'auth_session.user_agent': 'browser',
  'auth_session.ip': 'ip',
  'auth_session.public_id': {
    exempt:
      'An opaque handle so the sessions screen can address a session without ' +
      'the raw id leaving the server (07 L5). Carries nothing `id` does not.',
  },

  'auth_token.id': OWN_ROW,
  'auth_token.user_id': OWNER,
  'auth_token.kind': 'tokens',
  'auth_token.token_hash': 'tokens',
  'auth_token.expires_at': 'expiry',
  'auth_token.used_at': 'tokens',
  'auth_token.created_at': BOOKKEEPING,

  // ── What the account wrote ─────────────────────────────────────────────
  'note.id': OWN_ROW,
  'note.user_id': OWNER,
  'note.title': 'notes',
  'note.content_md': 'notes',
  'note.created_at': 'timestamps',
  'note.updated_at': 'timestamps',
  'note.tsv': {
    exempt:
      'A search index Postgres derives from title and content_md. It holds no ' +
      'information those two do not, and it cannot outlive them.',
  },
  'note.domain_id': 'domains',
  'note.deleted_at': 'deleted',

  'note_category.user_id': OWNER,
  'note_category.note_id': LINK,
  'note_category.category_id': 'categories',

  'card.id': OWN_ROW,
  'card.user_id': OWNER,
  'card.domain_id': 'domains',
  'card.type': {
    exempt:
      "Always 'basic'. What is left of the card types D-055 refused: the CHECK " +
      'still admits cloze and feynman, nothing writes them, and the column says ' +
      'nothing about the person either way.',
  },
  'card.front': 'cards',
  'card.back': 'cards',
  'card.deleted_at': 'deleted',
  'card.created_at': 'timestamps',
  'card.updated_at': 'timestamps',

  'card_category.user_id': OWNER,
  'card_category.card_id': LINK,
  'card_category.category_id': 'categories',

  'category.id': OWN_ROW,
  'category.user_id': OWNER,
  'category.slug': { exempt: 'A url-safe form of `label`, derived from it and nothing else.' },
  'category.label': 'categories',
  'category.archived_at': 'archived',
  'category.created_at': BOOKKEEPING,
  'category.color': 'colour',

  'domain.id': OWN_ROW,
  'domain.user_id': OWNER,
  'domain.slug': { exempt: 'A url-safe form of `label`, derived from it and nothing else.' },
  'domain.label': 'domains',
  'domain.color': 'colour',
  'domain.weekly_quota': 'weeklyQuota',
  'domain.sort_order': 'sortOrder',
  'domain.archived_at': 'archived',
  'domain.created_at': BOOKKEEPING,

  // ── What the account did ───────────────────────────────────────────────
  'card_schedule.card_id': LINK,
  'card_schedule.user_id': OWNER,
  'card_schedule.stage': 'schedule',
  'card_schedule.next_review_date': 'schedule',
  'card_schedule.lapses': 'lapses',
  'card_schedule.state': 'cardState',

  'review_log.id': OWN_ROW,
  'review_log.user_id': OWNER,
  'review_log.rating': 'reviewRating',
  'review_log.interval_before': 'interval',
  'review_log.interval_after': 'interval',
  'review_log.reviewed_at': 'reviewLog',
  'review_log.source': 'reviewSource',
  'review_log.run_id': LINK,
  'review_log.card_id': LINK,
  'review_log.format': 'reviewFormat',

  'focus_session.id': OWN_ROW,
  'focus_session.user_id': OWNER,
  'focus_session.duration_minutes': 'focusDuration',
  'focus_session.session_date': 'focus',
  'focus_session.completed_at': 'focus',
  'focus_session.domain_id': 'focus',

  // ── Practice sets and their sittings ───────────────────────────────────
  'review_set.id': OWN_ROW,
  'review_set.user_id': OWNER,
  'review_set.title': 'sets',
  'review_set.description': 'sets',
  'review_set.selection': 'setSelection',
  'review_set.question_count': 'questionCount',
  'review_set.time_limit_minutes': 'timeLimit',
  'review_set.archived_at': 'archived',
  'review_set.created_at': BOOKKEEPING,
  'review_set.updated_at': BOOKKEEPING,
  'review_set.format': 'reviewFormat',

  'review_set_card.set_id': LINK,
  'review_set_card.user_id': OWNER,
  'review_set_card.card_id': LINK,
  'review_set_card.position': { exempt: 'The order cards sit in inside one set.' },

  'review_set_category.user_id': OWNER,
  'review_set_category.set_id': LINK,
  'review_set_category.category_id': 'setSelection',

  'review_set_domain.user_id': OWNER,
  'review_set_domain.set_id': LINK,
  'review_set_domain.domain_id': 'setSelection',

  'review_run.id': OWN_ROW,
  'review_run.set_id': LINK,
  'review_run.user_id': OWNER,
  'review_run.started_at': 'runTiming',
  'review_run.finished_at': 'runTiming',
  'review_run.run_date': 'runTiming',
  'review_run.total_count': 'questionCount',
  'review_run.correct_count': 'runResult',

  'review_run_card.run_id': LINK,
  'review_run_card.user_id': OWNER,
  'review_run_card.card_id': LINK,
  'review_run_card.position': { exempt: 'The order the cards were drawn in for one sitting.' },
  // The snapshot D-050 is about. It is card text stored a second time, in a row
  // the user never wrote directly, which makes it the one category a reader
  // could not have guessed — so it is named rather than folded into "cards".
  'review_run_card.options': 'choiceOptions',
  'review_run_card.correct_index': 'choiceOptions',
} as const satisfies Record<ColumnKey, Coverage>
