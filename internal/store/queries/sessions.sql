-- name: InsertFocusSession :one
-- session_date is the client's LOCAL YYYY-MM-DD, passed in rather than derived
-- from now(): a 23:00 session belongs to that day, and the server may be in a
-- different timezone than the user.
INSERT INTO focus_sessions (user_id, domain_id, duration_minutes, session_date)
VALUES ($1, $2, $3, sqlc.arg(session_date)::date)
RETURNING *;

-- name: ListRecentFocusSessions :many
-- A window over the log, and deliberately not a page: there is no OFFSET here
-- because scrolling back through months of sessions is the Activity log
-- (PRD §5.10) and that is still deferred.
--
-- `total` is not, though. The list answered with a bounded slice and no count,
-- so thirty sessions out of three hundred and thirty out of thirty looked
-- identical on screen — the half of D-084's bug that misinforms rather than
-- hides. Counting it here rather than in a second query keeps the number and
-- the rows describing the same thing.
SELECT sqlc.embed(f), count(*) OVER () AS total
FROM focus_sessions f
WHERE f.user_id = $1
ORDER BY f.session_date DESC, f.completed_at DESC
LIMIT $2;
