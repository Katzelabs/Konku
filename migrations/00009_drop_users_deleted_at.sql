-- Account deletion is not soft, so the marker for it goes (07 L7).
--
-- Migration 00007 added users.deleted_at and flagged it as an open question
-- for this task: it was built as a marker for a deletion *request*, so that
-- locking an account out and purging its rows could be separate steps.
--
-- L7 answers it, and the answer is no. Its acceptance is that no row
-- referencing the old user_id remains and that the email can sign up again,
-- and a tombstoned users row fails both — the row is the thing holding the
-- unique constraint on the address. "Deletion means deletion" is the point;
-- a recoverable deleted account is an account that was not deleted, and this
-- is the one place in the app where the soft-delete instinct is wrong.
--
-- The separation the column was buying is not needed either. Every one of the
-- sixteen tables carrying user_id references users(id) ON DELETE CASCADE, so
-- the whole account leaves in a single statement inside a single transaction.
-- There is no window to lock out.
--
-- The 30 days in D-066 is about backups aging out, not a grace period. Nothing
-- in the live database waits.

-- +goose Up
-- +goose StatementBegin

DROP INDEX IF EXISTS users_deleted_at_idx;
ALTER TABLE users DROP COLUMN deleted_at;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE users ADD COLUMN deleted_at timestamptz;
CREATE INDEX users_deleted_at_idx ON users (deleted_at) WHERE deleted_at IS NOT NULL;

-- +goose StatementEnd
