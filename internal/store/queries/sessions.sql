-- name: InsertFocusSession :one
-- session_date is the client's LOCAL YYYY-MM-DD, passed in rather than derived
-- from now(): a 23:00 session belongs to that day, and the server may be in a
-- different timezone than the user.
INSERT INTO focus_sessions (user_id, domain_id, duration_minutes, session_date)
VALUES ($1, $2, $3, sqlc.arg(session_date)::date)
RETURNING *;

-- name: ListRecentFocusSessions :many
SELECT * FROM focus_sessions
WHERE user_id = $1
ORDER BY session_date DESC, completed_at DESC
LIMIT $2;
