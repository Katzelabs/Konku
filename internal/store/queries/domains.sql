-- Domains are per-user (D-046), so every query here carries user_id in the
-- WHERE clause exactly like notes and cards. A domain belonging to another
-- user does not match, so the caller gets "no rows" and the API returns 404
-- rather than 403 (D-039).
--
-- slug is deliberately absent from UpdateDomain: it is the seed identity, it
-- may appear in URLs, and renaming a domain is what `label` is for.

-- name: ListDomains :many
SELECT * FROM domains
WHERE user_id = $1 AND archived_at IS NULL
ORDER BY sort_order, label;

-- name: ListAllDomains :many
-- Archived included. A note or focus session tagged with an archived domain
-- still has to render its label, so the picker uses ListDomains and the
-- display path uses this.
SELECT * FROM domains
WHERE user_id = $1
ORDER BY archived_at NULLS FIRST, sort_order, label;

-- name: GetDomain :one
SELECT * FROM domains
WHERE id = $1 AND user_id = $2;

-- name: DomainExists :one
-- Validation for an incoming domainId. The composite foreign key is what
-- actually prevents a cross-tenant write (D-047); this exists only so the
-- handler can answer with a 400 and Indonesian copy instead of letting a
-- constraint violation surface as a 500.
SELECT EXISTS (
    SELECT 1 FROM domains
    WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
);

-- name: CreateDomain :one
INSERT INTO domains (user_id, slug, label, color, weekly_quota, sort_order)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateDomain :one
UPDATE domains
SET label        = $3,
    color        = $4,
    weekly_quota = $5,
    sort_order   = $6
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: ArchiveDomain :one
-- Soft, and the default way to remove a domain (D-051). Notes and sessions
-- keep their tag; the domain just leaves the picker.
UPDATE domains
SET archived_at = now()
WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
RETURNING *;

-- name: UnarchiveDomain :one
UPDATE domains
SET archived_at = NULL
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteDomain :execrows
-- Only succeeds for a domain nothing references — every FK pointing here is
-- ON DELETE NO ACTION (D-051). A referenced domain raises
-- foreign_key_violation, which the handler maps to 409, never a 500.
DELETE FROM domains
WHERE id = $1 AND user_id = $2;
