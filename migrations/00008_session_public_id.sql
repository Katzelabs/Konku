-- A non-credential handle for a session (07 L5).
--
-- The sessions screen has to name each session so one can be revoked, and the
-- obvious identifier is the only one that must never leave the server:
-- auth_sessions.id IS the credential. Sessions are opaque 256-bit random
-- strings stored server-side (D-039), so the cookie's value and the primary
-- key are the same string — listing session ids in a JSON response would hand
-- every one of the account's live credentials to any script on the page, and
-- undo the reason the cookie is HttpOnly in the first place.
--
-- So the API addresses a session by public_id and never sees id. Revoking
-- still resolves through the user's own rows, so a leaked public_id is worth
-- nothing without the session it belongs to.

-- +goose Up
-- +goose StatementBegin

-- DEFAULT on ADD COLUMN backfills existing rows in one pass on PG 11+, so the
-- sessions that exist right now get handles without a separate UPDATE.
ALTER TABLE auth_sessions
    ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();

-- Unique because it is a lookup key. The scoped delete matches on
-- (user_id, public_id), so this index also serves that query.
CREATE UNIQUE INDEX auth_sessions_public_id_key ON auth_sessions (public_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS auth_sessions_public_id_key;
ALTER TABLE auth_sessions DROP COLUMN public_id;

-- +goose StatementEnd
