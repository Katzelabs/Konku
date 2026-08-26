-- Suspending an account (ticket 10, O1).
--
-- ALLOW_SIGNUP is about to be flipped to true (D-095), which puts strangers'
-- data in this database. Until now the only answer to an account that has to
-- stop — a spam relay pointed at the verification mailer, an abusive address,
-- a compromised login the owner cannot reach — was an operator writing UPDATE
-- at a psql prompt against a column that did not exist. This is the column.
--
-- NULL means active. That is the same shape as email_verified_at (00007): the
-- timestamp answers "since when", which is the question an operator asks
-- second, and a boolean would have thrown that away for nothing.
--
-- Deliberately NOT the deleted_at that 00009 removed. Suspension is reversible
-- and holds nothing: the rows stay, the address stays claimed, and
-- `konku suspend-user -undo` puts the account back exactly as it was.
-- Deletion means deletion, and it is still a different endpoint (07 L7).

-- +goose Up
-- +goose StatementBegin

ALTER TABLE users ADD COLUMN suspended_at timestamptz;

-- No index, for the same reason 00010 added none.
--
-- Nothing looks an account up *by* this column. Every read of it comes from a
-- row already fetched by id (session resolution) or by email (login, the CLI),
-- both of which are unique-indexed already, so a partial index here would be
-- an index no query plan ever reaches for. The one thing that would want it —
-- "list every suspended account" — is not built, and a sequential scan over
-- the users table is the correct plan for it anyway at any size this instance
-- will see.
--
-- No RLS change either: 00006 already policies `users`, and this is a column
-- on a table that is already protected rather than a new table needing a
-- policy and a grant.

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE users DROP COLUMN suspended_at;

-- +goose StatementEnd
