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
SELECT * FROM notes
WHERE id = $1 AND user_id = $2;

-- name: UpdateNote :one
UPDATE notes
SET title      = $3,
    content_md = $4,
    domain_id  = $5,
    updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteNote :execrows
DELETE FROM notes
WHERE id = $1 AND user_id = $2;

-- name: ListNotes :many
SELECT n.*,
       (SELECT count(*) FROM cards c
         WHERE c.note_id = n.id AND c.deleted_at IS NULL) AS card_count
FROM notes n
WHERE n.user_id = $1
ORDER BY n.updated_at DESC
LIMIT $2 OFFSET $3;

-- name: ListDomains :many
SELECT * FROM domains ORDER BY weekly_quota DESC, id;
