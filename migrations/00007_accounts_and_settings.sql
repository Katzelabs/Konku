-- Accounts (07 L1).
--
-- The tables the account surface needs before anyone else can have an account:
-- verification state on users, the columns that make the active-sessions
-- screen possible, somewhere for per-user settings to live, and the token
-- table that verification and password reset both draw on.
--
-- Nothing here is used yet. L1 exists separately from L2–L5 because four
-- features need the same schema and discovering that halfway through the
-- second one means a migration per feature.

-- +goose Up
-- +goose StatementBegin

-- ---------------------------------------------------------------------------
-- users: verification state, and a deletion marker
-- ---------------------------------------------------------------------------

-- Verification gates the account (L3). Not politeness: the reset link is the
-- only recovery path there is, so an unverified address is an account that can
-- never be recovered, and an unverified signup form is a free spam relay
-- pointed at whatever address an attacker types.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

-- Existing accounts are backfilled as verified from their creation date.
--
-- They were created by `konku seed-user`, which means the operator typed the
-- address at a shell — a stronger check than clicking a link in a mailbox. The
-- alternative is that L3 ships and locks the only real account out of the app,
-- with no way back in because the reset flow it would need is also L3.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- Deletion is NOT soft (L7): a "recoverable" deleted account is an account
-- that was not deleted, and L7's acceptance is that no row referencing the old
-- user_id remains and the email can sign up again. A tombstoned row would
-- break both.
--
-- So this column marks a deletion *request*, not a deleted account. It exists
-- so the purge and the lockout can be separate: the account stops working the
-- moment the user confirms, and the rows go whenever the job runs. Without it
-- the two are the same transaction, and a partial failure leaves an account
-- that is half gone and still usable.
--
-- Open, and L7's to answer: whether that separation is worth having at all, or
-- whether the delete should just be one transaction and this column dropped.
ALTER TABLE users ADD COLUMN deleted_at timestamptz;

-- Partial: the lookup that runs on every login and every signup is "a live
-- account with this email", and deletion-pending rows are rare.
CREATE INDEX users_deleted_at_idx ON users (deleted_at) WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- auth_sessions: enough to render "where am I signed in"
-- ---------------------------------------------------------------------------
--
-- created_at already exists — 00001 shipped it. L1's list names it because the
-- session screen needs it, not because it is missing.
--
-- last_seen_at defaults to now() rather than being nullable: a session that has
-- never been seen does not exist, since creating one is a login. Backfilling
-- existing rows to their created_at is the honest value — the alternative
-- claims every old session was active at migration time.
ALTER TABLE auth_sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
UPDATE auth_sessions SET last_seen_at = created_at;

-- Both nullable and both unknown for existing rows. user_agent is bounded at
-- write time by the handler, not here — a CHECK on length would reject a login
-- rather than truncate a header, which is the wrong failure.
ALTER TABLE auth_sessions ADD COLUMN user_agent text;

-- text, not inet. The column is displayed and coarsely geolocated, never
-- matched against a subnet, so inet's operators buy nothing and its pgx
-- mapping (netip.Prefix) costs a conversion at every call site.
ALTER TABLE auth_sessions ADD COLUMN ip text;

-- ---------------------------------------------------------------------------
-- user_settings: the open question from DECISIONS.md, closed
-- ---------------------------------------------------------------------------
--
-- Progressive focus N, default timer duration and rota preference were
-- constants under one user. Multi-tenant they are per-user, and there was
-- nowhere for them to live. The account screen (D-058) and the export (D-066)
-- both need somewhere to hang.
--
-- user_id is the primary key, not a separate id with a unique constraint. One
-- row per user is the invariant, and a PK states it rather than defending it.
CREATE TABLE user_settings (
    user_id                  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    -- Bounds match internal/api/sessions.go's minDurationMinutes and
    -- maxDurationMinutes. The default is web/src/features/timer's
    -- DEFAULT_DURATION, which is where it currently lives as a constant.
    default_duration_minutes int  NOT NULL DEFAULT 20
                                  CHECK (default_duration_minutes BETWEEN 1 AND 480),
    -- D-037, still 5, still to be tuned against real session data — which is
    -- now per-account data, so the constant had to become a column first.
    focus_step_n             int  NOT NULL DEFAULT 5
                                  CHECK (focus_step_n BETWEEN 1 AND 20),
    -- The weekly rota is opt-out, not opt-in: it is the feature that makes
    -- domains do anything, and defaulting it off would make a new account look
    -- like the rota does not exist.
    rota_enabled             boolean NOT NULL DEFAULT true,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Every existing account gets a row, so nothing above the store has to treat a
-- missing settings row as "use the defaults". Signup (L3) seeds one the same
-- way it seeds the five default domains (D-046).
INSERT INTO user_settings (user_id) SELECT id FROM users;

-- ---------------------------------------------------------------------------
-- auth_tokens: verification and reset
-- ---------------------------------------------------------------------------
--
-- Stores a HASH, never the token. A leaked database dump must not be a set of
-- working password-reset links.
--
-- The hash is a plain SHA-256, not argon2id like a password. Correct here and
-- not a shortcut: the token is 256 bits of CSPRNG output, so there is no
-- guessable input to slow an attacker down against. argon2id would cost every
-- verification click ~100ms of CPU to defend a search space that cannot be
-- searched. Password hashing is slow because passwords are weak.
--
-- Single-use and expiring are both enforced at the query, not by a constraint:
-- "used_at IS NULL AND expires_at > now()" in the WHERE of the UPDATE that
-- claims the token, so claiming it is one atomic statement and two concurrent
-- clicks cannot both win.
CREATE TABLE auth_tokens (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('verify', 'reset')),
    -- UNIQUE so the lookup is by hash alone. The token in the link carries no
    -- user id: including one would let an attacker enumerate accounts by
    -- watching which ids produce a different error.
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Resend is rate-limited by address as well as by IP (L3), which means
-- counting a user's recent tokens of one kind.
CREATE INDEX auth_tokens_user_kind_idx ON auth_tokens (user_id, kind, created_at DESC);

-- The cleanup sweep: expired or spent tokens are garbage and should not
-- accumulate for the lifetime of the account.
CREATE INDEX auth_tokens_expires_at_idx ON auth_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- Grants and RLS (D-059)
-- ---------------------------------------------------------------------------
--
-- There is deliberately no ALTER DEFAULT PRIVILEGES in 00006, so a new table
-- is inaccessible to the app until it is granted here — and
-- TestEveryUserTableIsProtected fails until it also has a forced policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings, auth_tokens TO konku_app;

-- user_settings is ordinary owned data: it scopes strictly, like notes.
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY user_settings_tenant ON user_settings
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- auth_tokens is auth substrate, and follows users and auth_sessions rather
-- than the strict pattern above. Verifying an address and resetting a password
-- both happen with no session: the token IS the identity, so a policy that
-- requires app.user_id to already be set would deny the only two paths this
-- table exists for.
--
-- Stated as honestly as 00006 states it for auth_sessions: the unset branch is
-- a hole, and it is the auth path's hole. What it buys is that an
-- authenticated request — every request that reaches a normal handler — still
-- cannot read another account's tokens. The token hash remains the credential,
-- and it is a hash of a value that exists only in one mailbox.
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_tokens_tenant ON auth_tokens
    USING (
        NULLIF(current_setting('app.user_id', true), '') IS NULL
        OR user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
    WITH CHECK (
        NULLIF(current_setting('app.user_id', true), '') IS NULL
        OR user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    );

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP POLICY IF EXISTS auth_tokens_tenant ON auth_tokens;
DROP POLICY IF EXISTS user_settings_tenant ON user_settings;

REVOKE ALL ON user_settings, auth_tokens FROM konku_app;

DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS user_settings;

ALTER TABLE auth_sessions DROP COLUMN ip;
ALTER TABLE auth_sessions DROP COLUMN user_agent;
ALTER TABLE auth_sessions DROP COLUMN last_seen_at;

DROP INDEX IF EXISTS users_deleted_at_idx;
ALTER TABLE users DROP COLUMN deleted_at;
ALTER TABLE users DROP COLUMN email_verified_at;

-- +goose StatementEnd
