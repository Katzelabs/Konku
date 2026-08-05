-- name: ListCardsByNote :many
-- Live cards only. Sync (C3) compares against these by ID.
SELECT * FROM cards
WHERE note_id = $1 AND user_id = $2 AND deleted_at IS NULL
ORDER BY line;

-- name: UpsertCard :one
-- Also un-deletes: re-adding a card with the same ID restores it, and because
-- card_schedules is keyed on (note_id, card_id) and untouched here, its review
-- history comes back with it. Undoing an accidental deletion must not cost the
-- user months of progress (D-019).
INSERT INTO cards (id, note_id, user_id, type, front, back, line)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (note_id, id) DO UPDATE
SET type       = EXCLUDED.type,
    front      = EXCLUDED.front,
    back       = EXCLUDED.back,
    line       = EXCLUDED.line,
    deleted_at = NULL
RETURNING *;

-- name: SoftDeleteCard :exec
-- Never a hard delete: the card's review history outlives the markdown line.
UPDATE cards
SET deleted_at = now()
WHERE note_id = $1 AND id = $2 AND user_id = $3;

-- name: GetCardWithSchedule :one
SELECT sqlc.embed(c), sqlc.embed(s)
FROM cards c
JOIN card_schedules s ON s.note_id = c.note_id AND s.card_id = c.id
WHERE c.note_id = $1 AND c.id = $2 AND c.user_id = $3 AND c.deleted_at IS NULL;

-- name: CreateSchedule :one
-- ON CONFLICT DO NOTHING is what preserves history across an edit: a card that
-- already has a schedule keeps it, so fixing a typo never resets stage.
INSERT INTO card_schedules (note_id, card_id, user_id, stage, next_review_date, state)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (note_id, card_id) DO NOTHING
RETURNING *;

-- name: UpdateSchedule :one
UPDATE card_schedules
SET stage            = $4,
    next_review_date = $5,
    lapses           = $6,
    state            = $7
WHERE note_id = $1 AND card_id = $2 AND user_id = $3
RETURNING *;

-- name: ListDueCards :many
-- Oldest-due first, capped by the caller (D-009). Excludes mastered cards and
-- soft-deleted ones. Returns the prompt side only — the answer is fetched
-- separately when the user chooses to reveal (D-003).
SELECT c.note_id, c.id, c.type, c.front, s.next_review_date
FROM card_schedules s
JOIN cards c ON c.note_id = s.note_id AND c.id = s.card_id
WHERE s.user_id = $1
  AND s.state = 'learning'
  AND s.next_review_date IS NOT NULL
  AND s.next_review_date <= sqlc.arg(today)::date
  AND c.deleted_at IS NULL
ORDER BY s.next_review_date, c.id
LIMIT $2;

-- name: CountDueCards :one
SELECT count(*) FROM card_schedules s
JOIN cards c ON c.note_id = s.note_id AND c.id = s.card_id
WHERE s.user_id = $1
  AND s.state = 'learning'
  AND s.next_review_date IS NOT NULL
  AND s.next_review_date <= sqlc.arg(today)::date
  AND c.deleted_at IS NULL;

-- name: InsertReviewLog :one
-- Written on every single review. The retention metric cannot be
-- reconstructed retroactively, which is why this exists before the feature
-- that reads it (D-029).
INSERT INTO review_logs (note_id, card_id, user_id, rating, interval_before, interval_after)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;
