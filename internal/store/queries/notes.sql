-- Every query here carries user_id in the WHERE clause.
--
-- Ownership is never checked after the fact: a row belonging to another user
-- simply does not match, so the caller gets "no rows" and the API returns 404.
-- That makes it impossible to use this API to discover whether another user's
-- note exists (D-039).

-- name: CreateNote :one
INSERT INTO notes (user_id, title, content_md, domain_id)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetNote :one
-- A deleted note reads as absent. The Terhapus view lists them, but every
-- other path — the editor, a PATCH, a category lookup — must not resurrect one
-- by accident.
SELECT * FROM notes
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: UpdateNote :one
UPDATE notes
SET title      = $3,
    content_md = $4,
    domain_id  = $5,
    updated_at = now()
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteNotes :execrows
-- Never a hard delete (00005). One statement serves the single-note button and
-- the bulk selection alike: deleting one is deleting an array of one, so there
-- is no second code path to keep in step.
--
-- Already-deleted ids simply do not match, which makes a repeated request a
-- no-op rather than a way to push deleted_at forward.
UPDATE notes
SET deleted_at = now(), updated_at = now()
WHERE user_id = $1 AND id = ANY(sqlc.arg(ids)::uuid[]) AND deleted_at IS NULL;

-- name: RestoreNotes :execrows
-- The undo. note_categories was never touched, so a restored note comes back
-- still wearing its labels.
UPDATE notes
SET deleted_at = NULL, updated_at = now()
WHERE user_id = $1 AND id = ANY(sqlc.arg(ids)::uuid[]) AND deleted_at IS NOT NULL;

-- name: ListNotes :many
-- The card count is gone with D-055: a note no longer contains cards, so
-- counting them per note would be counting nothing.
--
-- `deleted` switches the whole list between live notes and the Terhapus view.
-- One query rather than two so the filters, the ordering and the category
-- aggregation cannot drift apart between them.
SELECT n.*,
       COALESCE(
           (SELECT array_agg(nc.category_id ORDER BY nc.category_id)
              FROM note_categories nc
             WHERE nc.note_id = n.id),
           '{}'
       )::uuid[] AS category_ids
FROM notes n
WHERE n.user_id = $1
  AND CASE WHEN sqlc.arg(deleted)::bool
           THEN n.deleted_at IS NOT NULL
           ELSE n.deleted_at IS NULL
      END
  AND (sqlc.narg(domain_id)::uuid IS NULL OR n.domain_id = sqlc.narg(domain_id))
  AND (sqlc.narg(category_id)::uuid IS NULL OR EXISTS (
          SELECT 1 FROM note_categories nc
           WHERE nc.note_id = n.id AND nc.category_id = sqlc.narg(category_id)))
ORDER BY n.updated_at DESC
LIMIT $2 OFFSET $3;

-- The note's categories.

-- name: ClearNoteCategories :exec
DELETE FROM note_categories
WHERE note_id = $1 AND user_id = $2;

-- name: AddNoteCategory :exec
INSERT INTO note_categories (user_id, note_id, category_id)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: ListCategoriesForNote :many
SELECT cat.* FROM categories cat
JOIN note_categories nc ON nc.category_id = cat.id AND nc.user_id = cat.user_id
WHERE nc.note_id = $1 AND nc.user_id = $2
ORDER BY cat.label;
