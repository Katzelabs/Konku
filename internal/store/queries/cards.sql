-- Cards are their own feature (D-055): rows created and edited directly, not
-- parsed out of a note body. There is no note_id, and no ID to keep stable
-- across a text edit — UPDATE keeps the uuid, so editing a card's wording can
-- no longer cost it its schedule.
--
-- Every query here carries user_id in the WHERE clause. A row belonging to
-- another user simply does not match, so the caller gets "no rows" and the API
-- returns 404 — never 403, which would confirm the row exists (D-039).

-- name: CreateCard :one
INSERT INTO cards (user_id, domain_id, type, front, back)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetCard :one
SELECT * FROM cards
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: UpdateCard :one
-- No content matching anywhere: the uuid identifies the card and the text is
-- just a column. Rewriting front and back leaves card_schedules untouched, so
-- fixing a typo costs nothing — the property D-019's stable IDs existed to
-- protect, now free.
UPDATE cards
SET domain_id  = $3,
    front      = $4,
    back       = $5,
    updated_at = now()
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteCards :execrows
-- Never a hard delete. A finished exam attempt renders its questions by
-- joining cards, so removing the row would blank out past results, and
-- deletion on a CRUD screen should be undoable.
--
-- Takes an array so the single-card button and the bulk selection run the same
-- statement: deleting one is deleting an array of one. Already-deleted ids do
-- not match, so a repeated request is a no-op rather than a way to push
-- deleted_at forward.
UPDATE cards
SET deleted_at = now(), updated_at = now()
WHERE user_id = $1 AND id = ANY(sqlc.arg(ids)::uuid[]) AND deleted_at IS NULL;

-- name: RestoreCards :execrows
-- The undo. card_schedules was never touched, so the review history comes back
-- with the card.
UPDATE cards
SET deleted_at = NULL, updated_at = now()
WHERE user_id = $1 AND id = ANY(sqlc.arg(ids)::uuid[]) AND deleted_at IS NOT NULL;

-- name: ListCards :many
-- The Cards page. Every filter is optional and independent; passing none lists
-- everything live, newest first.
--
-- `deleted` switches the whole list to the Terhapus view. One query rather
-- than two so the filters and the category aggregation cannot drift apart
-- between them.
SELECT c.*,
       COALESCE(
           (SELECT array_agg(cc.category_id ORDER BY cc.category_id)
              FROM card_categories cc
             WHERE cc.card_id = c.id),
           '{}'
       )::uuid[] AS category_ids
FROM cards c
WHERE c.user_id = $1
  AND CASE WHEN sqlc.arg(deleted)::bool
           THEN c.deleted_at IS NOT NULL
           ELSE c.deleted_at IS NULL
      END
  -- Many domains and many categories, with the same semantics a review set's
  -- draw uses (D-077): OR inside each group, AND between them.
  --
  -- coalesce, not a bare cardinality(): pgx encodes a nil Go slice as SQL NULL
  -- rather than '{}', and cardinality(NULL) is NULL, which makes the whole OR
  -- null and drops every row.
  AND (coalesce(cardinality(sqlc.arg(domain_ids)::uuid[]), 0) = 0
       OR c.domain_id = ANY(sqlc.arg(domain_ids)::uuid[]))
  AND (coalesce(cardinality(sqlc.arg(category_ids)::uuid[]), 0) = 0
       OR EXISTS (SELECT 1 FROM card_categories cc
                   WHERE cc.card_id = c.id
                     AND cc.category_id = ANY(sqlc.arg(category_ids)::uuid[])))
  -- ILIKE, not full-text: D-031 defers ranked search to v0.2. cards_front_trgm_idx
  -- is what keeps this from being a sequential scan.
  AND (sqlc.narg(query)::text IS NULL
       OR c.front ILIKE '%' || sqlc.narg(query) || '%'
       OR c.back  ILIKE '%' || sqlc.narg(query) || '%')
ORDER BY c.created_at DESC
LIMIT $2;

-- name: CountCards :one
SELECT count(*) FROM cards
WHERE user_id = $1 AND deleted_at IS NULL;

-- The card's categories.

-- name: ClearCardCategories :exec
DELETE FROM card_categories
WHERE card_id = $1 AND user_id = $2;

-- name: AddCardCategory :exec
-- ON CONFLICT DO NOTHING so re-sending the same set is idempotent rather than
-- a 500.
INSERT INTO card_categories (user_id, card_id, category_id)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: ListCategoriesForCard :many
SELECT cat.* FROM categories cat
JOIN card_categories cc ON cc.category_id = cat.id AND cc.user_id = cat.user_id
WHERE cc.card_id = $1 AND cc.user_id = $2
ORDER BY cat.label;

-- Scheduling.

-- name: CreateSchedule :one
-- ON CONFLICT DO NOTHING is what preserves history: a card that already has a
-- schedule keeps it, so restoring a deleted card never resets its stage.
INSERT INTO card_schedules (card_id, user_id, stage, next_review_date, state)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (card_id) DO NOTHING
RETURNING *;

-- name: UpdateSchedule :one
UPDATE card_schedules
SET stage            = $3,
    next_review_date = $4,
    lapses           = $5,
    state            = $6
WHERE card_id = $1 AND user_id = $2
RETURNING *;

-- name: GetCardWithSchedule :one
SELECT sqlc.embed(c), sqlc.embed(s)
FROM cards c
JOIN card_schedules s ON s.card_id = c.id AND s.user_id = c.user_id
WHERE c.id = $1 AND c.user_id = $2 AND c.deleted_at IS NULL;

-- name: ListDueCards :many
-- Oldest-due first, capped by the caller (D-009). Excludes mastered and
-- deleted cards. Returns the prompt side only — the answer is fetched
-- separately when the user chooses to reveal (D-003).
SELECT c.id, c.type, c.front, s.next_review_date
FROM card_schedules s
JOIN cards c ON c.id = s.card_id AND c.user_id = s.user_id
WHERE s.user_id = $1
  AND s.state = 'learning'
  AND s.next_review_date IS NOT NULL
  AND s.next_review_date <= sqlc.arg(today)::date
  AND c.deleted_at IS NULL
ORDER BY s.next_review_date, c.id
LIMIT $2;

-- name: CountDueCards :one
SELECT count(*) FROM card_schedules s
JOIN cards c ON c.id = s.card_id AND c.user_id = s.user_id
WHERE s.user_id = $1
  AND s.state = 'learning'
  AND s.next_review_date IS NOT NULL
  AND s.next_review_date <= sqlc.arg(today)::date
  AND c.deleted_at IS NULL;

-- name: InsertReviewLog :one
-- Written on every single review. The retention metric cannot be
-- reconstructed retroactively, which is why this exists before the feature
-- that reads it (D-029).
INSERT INTO review_logs (card_id, user_id, rating, interval_before, interval_after)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
