-- name: CreateUser :one
-- The id is supplied rather than defaulted so the caller knows the identity
-- before the row exists. Account creation runs inside WithUserTx, and
-- app.user_id has to be set before the INSERT for the users WITH CHECK policy
-- to pass and for the starter domains to be insertable in the same
-- transaction (D-046, D-059).
--
-- email_verified_at is a parameter rather than a default because the two ways
-- an account can come into existence differ exactly there: `konku seed-user`
-- passes now(), since the operator typed the address at a shell and that is a
-- stronger check than clicking a link in a mailbox; public signup passes NULL
-- and sends the mail (07 L3).
INSERT INTO users (id, email, password_hash, email_verified_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: CreateUserSettings :one
-- One row per account, created with the account. Nothing above the store then
-- has to treat a missing settings row as "use the defaults" (07 L1).
INSERT INTO user_settings (user_id)
VALUES ($1)
RETURNING *;

-- name: MarkEmailVerified :exec
-- Idempotent on purpose: a second click on the same link is a no-op rather
-- than a moved timestamp. The token is already spent by then anyway.
UPDATE users
SET email_verified_at = now()
WHERE id = $1 AND email_verified_at IS NULL;

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

-- name: DeleteSessionsForUser :exec
-- Every session, including the one making the request.
--
-- A password reset is what someone does when they think their account is
-- compromised. A reset that leaves the attacker's session alive does nothing
-- at all, so this is the point of the feature rather than a tidy-up (07 L4).
DELETE FROM auth_sessions WHERE user_id = $1;

-- name: UpdatePassword :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- Verification and reset tokens (07 L1, L3, L4). The table stores a hash, never
-- the token: a leaked dump must not be a set of working links.

-- name: CreateAuthToken :one
INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ClaimAuthToken :one
-- Single-use and expiry are enforced here, in one statement, rather than by
-- reading the row and then updating it. Two concurrent clicks on the same link
-- cannot both win: the UPDATE matches once and the loser gets no rows.
--
-- Every failure mode — unknown token, wrong kind, already used, expired —
-- returns no rows, so the caller cannot tell them apart and neither can the
-- client (07 L4).
UPDATE auth_tokens
SET used_at = now()
WHERE token_hash = $1
  AND kind = $2
  AND used_at IS NULL
  AND expires_at > now()
RETURNING *;

-- name: DeleteExpiredAuthTokens :exec
-- Spent and expired tokens are garbage. Swept opportunistically, like sessions.
DELETE FROM auth_tokens WHERE expires_at <= now() OR used_at IS NOT NULL;
