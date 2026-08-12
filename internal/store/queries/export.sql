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
SELECT id, email, created_at, email_verified_at
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
SELECT id, slug, label, archived_at, created_at
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
       source, exam_attempt_id
FROM review_logs
WHERE user_id = $1
ORDER BY reviewed_at;

-- name: ExportFocusSessions :many
SELECT id, domain_id, duration_minutes, session_date, completed_at
FROM focus_sessions
WHERE user_id = $1
ORDER BY session_date, completed_at;

-- name: ExportExams :many
SELECT id, domain_id, title, description, selection, question_count,
       time_limit_minutes, archived_at, created_at, updated_at
FROM exams
WHERE user_id = $1
ORDER BY created_at;

-- name: ExportExamCards :many
SELECT exam_id, card_id, position
FROM exam_cards
WHERE user_id = $1
ORDER BY exam_id, position;

-- name: ExportExamAttempts :many
SELECT id, exam_id, started_at, finished_at, attempt_date, total_count,
       correct_count
FROM exam_attempts
WHERE user_id = $1
ORDER BY started_at;

-- name: ExportExamAttemptCards :many
SELECT attempt_id, card_id, position
FROM exam_attempt_cards
WHERE user_id = $1
ORDER BY attempt_id, position;
