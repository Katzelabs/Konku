-- Everything an account owns (07 L6).
--
-- Three rules run through this file:
--
--   1. **Explicit columns, never `SELECT *`.** notes.tsv is a generated
--      tsvector that means nothing outside Postgres, and users.password_hash
--      must not leave the server under any circumstance. A `*` here would put
--      both in the archive the first time someone adds a column.
--   2. **No filters beyond the tenancy predicate.** Soft-deleted notes and
--      cards are still rows the account owns, and an export that quietly drops
--      them is the silent disappearance this whole product exists to prevent.
--      The archive separates them into their own folder instead.
--   3. **Every query is scoped by user_id in the WHERE clause** (hard rule 4).
--      RLS backs this up; it does not replace it.
--
-- auth_sessions and auth_tokens are deliberately absent. A session id is a
-- live credential and a token hash is the shadow of one — neither is content
-- the user wrote, and putting them in a file that gets emailed around is a way
-- to lose an account, not a way to own your data.

-- name: ExportUser :one
-- The name is part of what the account holds about the person, so it is part
-- of what "everything we have on you" means (07 L6). Omitting it would make
-- the archive quietly incomplete in exactly the field a reader would check
-- first.
SELECT id, email, first_name, last_name, created_at, email_verified_at
FROM users
WHERE id = $1;

-- name: ExportUserSettings :one
SELECT user_id, default_duration_minutes, focus_step_n, rota_enabled,
       created_at, updated_at
FROM user_settings
WHERE user_id = $1;

-- name: ExportDomains :many
SELECT id, slug, label, color, weekly_quota, sort_order, archived_at, created_at
FROM domains
WHERE user_id = $1
ORDER BY sort_order, created_at;

-- name: ExportCategories :many
-- Colour travels with the archive (00011). It is a thing the user chose, and
-- an export that silently drops the choices they made is not the whole account.
SELECT id, slug, label, color, archived_at, created_at
FROM categories
WHERE user_id = $1
ORDER BY created_at;

-- name: ExportNotes :many
SELECT id, title, content_md, domain_id, deleted_at, created_at, updated_at
FROM notes
WHERE user_id = $1
ORDER BY created_at;

-- name: ExportNoteCategories :many
SELECT note_id, category_id
FROM note_categories
WHERE user_id = $1;

-- name: ExportCards :many
SELECT id, type, front, back, domain_id, deleted_at, created_at, updated_at
FROM cards
WHERE user_id = $1
ORDER BY created_at;

-- name: ExportCardCategories :many
SELECT card_id, category_id
FROM card_categories
WHERE user_id = $1;

-- name: ExportCardSchedules :many
-- The part that cannot be reconstructed from the notes: where each card sits
-- in the rotation.
SELECT card_id, stage, next_review_date, lapses, state
FROM card_schedules
WHERE user_id = $1;

-- name: ExportReviewLogs :many
-- The retention history, which is the one dataset here that cannot be
-- recreated after the fact (D-029). Oldest first, so the file reads as a
-- timeline.
SELECT id, card_id, rating, interval_before, interval_after, reviewed_at,
       source, run_id, format
FROM review_logs
WHERE user_id = $1
ORDER BY reviewed_at;

-- name: ExportFocusSessions :many
SELECT id, domain_id, duration_minutes, session_date, completed_at
FROM focus_sessions
WHERE user_id = $1
ORDER BY session_date, completed_at;

-- name: ExportReviewSets :many
SELECT id, title, description, selection, question_count,
       time_limit_minutes, format, archived_at, created_at, updated_at
FROM review_sets
WHERE user_id = $1
ORDER BY created_at;

-- name: ExportReviewSetDomains :many
-- The filters are part of the configuration, so an export that omitted them
-- would describe a set that draws from everything (07 L6: the archive is the
-- whole account, not a summary of it).
SELECT set_id, domain_id
FROM review_set_domains
WHERE user_id = $1
ORDER BY set_id, domain_id;

-- name: ExportReviewSetCategories :many
SELECT set_id, category_id
FROM review_set_categories
WHERE user_id = $1
ORDER BY set_id, category_id;

-- name: ExportReviewSetCards :many
SELECT set_id, card_id, position
FROM review_set_cards
WHERE user_id = $1
ORDER BY set_id, position;

-- name: ExportReviewRuns :many
SELECT id, set_id, started_at, finished_at, run_date, total_count,
       correct_count
FROM review_runs
WHERE user_id = $1
ORDER BY started_at;

-- name: ExportReviewRunCards :many
-- options and correct_index included: they are what the question actually
-- looked like, and a run's history without them is not the run.
SELECT run_id, card_id, position, options, correct_index
FROM review_run_cards
WHERE user_id = $1
ORDER BY run_id, position;
