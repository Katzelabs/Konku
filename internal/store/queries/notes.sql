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
       )::uuid[] AS category_ids,
       -- How many match before LIMIT, carried on every row (D-084).
       --
       -- A window function rather than a second CountNotes query: the header
       -- states this number beside a page drawn from the same predicate, and
       -- two round trips can disagree about it. It is counted after every
       -- filter and after the `deleted` switch, so Terhapus reports its own
       -- total and a filtered list reports the filtered one. An empty result
       -- returns no rows at all, and the caller reads that as 0 — correct.
       count(*) OVER () AS total
FROM notes n
WHERE n.user_id = $1
  AND CASE WHEN sqlc.arg(deleted)::bool
           THEN n.deleted_at IS NOT NULL
           ELSE n.deleted_at IS NULL
      END
  -- Many domains and many categories, with the same semantics a review set's
  -- draw uses (D-077): OR inside each group, AND between them. Picking
  -- Matematika and Fisika means either; adding the "rumus" category narrows
  -- that to notes which are also tagged with it.
  --
  -- coalesce, not a bare cardinality(): pgx encodes a nil Go slice as SQL NULL
  -- rather than '{}', and cardinality(NULL) is NULL, which makes the whole OR
  -- null and drops every row. "No filter" would then mean "match nothing" for
  -- any caller that passed nil instead of an empty slice.
  AND (coalesce(cardinality(sqlc.arg(domain_ids)::uuid[]), 0) = 0
       OR n.domain_id = ANY(sqlc.arg(domain_ids)::uuid[]))
  AND (coalesce(cardinality(sqlc.arg(category_ids)::uuid[]), 0) = 0
       OR EXISTS (SELECT 1 FROM note_categories nc
                   WHERE nc.note_id = n.id
                     AND nc.category_id = ANY(sqlc.arg(category_ids)::uuid[])))
  -- Title only, and ILIKE rather than full-text: D-031 defers ranked search to
  -- v0.2 and the placeholder says "judul". This used to be a client-side
  -- filter over whatever the first page happened to contain, which searched
  -- 50 notes and looked like it had searched all of them (D-084).
  --
  -- notes_title_trgm_idx has existed since 00001 and is what keeps this off a
  -- sequential scan — the same index cards_front_trgm_idx is for ListCards.
  AND (sqlc.narg(query)::text IS NULL
       OR n.title ILIKE '%' || sqlc.narg(query) || '%')
-- id breaks the tie. Two notes saved in the same transaction share an
-- updated_at, and an unordered tie can seat a row differently between two
-- pages of the same list — once as the last row of one page and never again,
-- or twice. Paging by offset needs a total order to slice.
ORDER BY n.updated_at DESC, n.id DESC
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
