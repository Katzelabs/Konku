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
-- user_agent and ip are what make the sessions screen readable (07 L5). Both
-- are nullable: a client that sends no User-Agent still gets a session.
INSERT INTO auth_sessions (id, user_id, expires_at, user_agent, ip)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListSessionsForUser :many
-- Newest activity first, which is the order the screen reads in.
--
-- Deliberately does NOT select id: that column is the credential, and a list
-- endpoint that returned it would hand every live session of the account to
-- any script on the page (migration 00008).
--
-- "Which of these is the one asking" is answered here, as a boolean, rather
-- than by handing the ids to Go and comparing there. The credential then never
-- leaves Postgres at all, so no future refactor can serialise it by accident.
SELECT public_id,
       (id = sqlc.arg(current_session_id)) AS is_current,
       created_at, last_seen_at, user_agent, ip, expires_at
FROM auth_sessions
WHERE user_id = sqlc.arg(user_id) AND expires_at > now()
ORDER BY last_seen_at DESC;

-- name: TouchSession :exec
-- Bumped at most once per interval, not on every request.
--
-- The caller decides when to call this from the last_seen_at it already has,
-- so the common case costs nothing. The predicate is repeated here anyway:
-- two requests arriving together would otherwise both write.
UPDATE auth_sessions
SET last_seen_at = now()
WHERE id = $1 AND last_seen_at < $2;

-- name: DeleteSessionForUser :execrows
-- Scoped by user_id in the WHERE, never fetch-then-check (hard rule 4). A
-- public_id belonging to someone else affects no rows, and the handler turns
-- that into 404 rather than 403 (D-039).
DELETE FROM auth_sessions
WHERE user_id = $1 AND public_id = $2;

-- name: DeleteOtherSessionsForUser :exec
-- Everything except the caller's own session, which is what "sign out
-- everywhere else" means. Revoking the current one too would log the user out
-- of the screen they are using to do it.
DELETE FROM auth_sessions
WHERE user_id = $1 AND id <> $2;

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
