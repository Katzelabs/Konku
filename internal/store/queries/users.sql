-- name: CreateUser :one
INSERT INTO users (email, password_hash)
VALUES ($1, $2)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: CountUsers :one
SELECT count(*) FROM users;

-- Auth sessions are server-side so logout actually revokes access (D-039).
-- The table is auth_sessions, not sessions, because focus sessions and exam
-- attempts both wanted that name (D-052).

-- name: CreateSession :one
INSERT INTO auth_sessions (id, user_id, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetActiveSession :one
-- Expiry is enforced here rather than in Go, so an expired session can never
-- be treated as valid by a caller that forgot to check.
SELECT sqlc.embed(auth_sessions), sqlc.embed(users)
FROM auth_sessions
JOIN users ON users.id = auth_sessions.user_id
WHERE auth_sessions.id = $1
  AND auth_sessions.expires_at > now();

-- name: DeleteSession :exec
DELETE FROM auth_sessions WHERE id = $1;

-- name: DeleteExpiredSessions :exec
DELETE FROM auth_sessions WHERE expires_at <= now();
