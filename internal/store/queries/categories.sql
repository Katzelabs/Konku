-- Categories are one shared vocabulary across notes and cards (D-055).
--
-- Not domains. A domain is exactly one per note or card, drives the weekly
-- rota and exam draws, and carries a colour. A category is many per note or
-- card, means nothing to the scheduler, and exists to organise.

-- name: ListCategories :many
-- Archived categories are excluded unless asked for: they stay attached to
-- everything they ever labelled, they just leave the picker.
--
-- Both counts exclude soft-deleted notes and cards. The join rows survive a
-- delete so a restore brings the labels back with the item (00005), but a
-- count that includes them reads as "12 catatan" next to a list showing four.
SELECT c.*,
       (SELECT count(*) FROM note_categories nc
          JOIN notes n ON n.id = nc.note_id AND n.user_id = nc.user_id
         WHERE nc.category_id = c.id AND n.deleted_at IS NULL) AS note_count,
       (SELECT count(*) FROM card_categories cc
          JOIN cards cd ON cd.id = cc.card_id AND cd.user_id = cc.user_id
         WHERE cc.category_id = c.id AND cd.deleted_at IS NULL) AS card_count
FROM categories c
WHERE c.user_id = $1
  AND (c.archived_at IS NULL OR sqlc.arg(include_archived)::bool)
ORDER BY c.label;

-- name: GetCategory :one
SELECT * FROM categories
WHERE id = $1 AND user_id = $2;

-- name: GetCategoryBySlug :one
-- Create-on-type resolves an existing category before making a new one, so a
-- user typing a label they already have does not collide with the unique
-- index.
SELECT * FROM categories
WHERE slug = $1 AND user_id = $2;

-- name: CreateCategory :one
INSERT INTO categories (user_id, slug, label)
VALUES ($1, $2, $3)
RETURNING *;

-- name: UpdateCategory :one
-- Renaming is the whole reason categories are rows rather than strings on the
-- note: every label already applied follows the rename.
UPDATE categories
SET slug = $3, label = $4
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: ArchiveCategory :one
-- The normal way to retire one (D-051).
UPDATE categories
SET archived_at = now()
WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
RETURNING *;

-- name: UnarchiveCategory :one
UPDATE categories
SET archived_at = NULL
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteCategory :execrows
-- Only succeeds when nothing references it: both join tables are ON DELETE NO
-- ACTION, so a category still in use raises foreign_key_violation and the
-- handler answers 409 rather than silently unlabelling a hundred cards.
DELETE FROM categories
WHERE id = $1 AND user_id = $2;
