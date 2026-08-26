-- The language an account reads in (ticket 11, I2).
--
-- D-094 makes every user-facing string bilingual and fixes the resolution
-- order: account setting → Accept-Language → id. This is the account setting.
--
-- ---------------------------------------------------------------------------
-- Why this is on users and not on user_settings
-- ---------------------------------------------------------------------------
--
-- It was written against user_settings first, which is where per-account
-- preferences live (00007) and is where anyone would look for it. RLS refused
-- it, and the refusal is right.
--
-- The locale has to be known on *every* authenticated request, because any
-- handler can answer with a `writeError` message and that message is copy
-- somebody reads. The only query that already runs on every authenticated
-- request is GetActiveSession — the one that turns a session id into an
-- identity — so the column has to be reachable from there or it costs a whole
-- extra transaction per request. On a pool capped at 10 for the sake of every
-- other project on the box (D-028), that is not a rounding error; it is the
-- reason TouchSession is throttled instead of unconditional.
--
-- And GetActiveSession runs *before* there is an identity, so it runs with no
-- `app.user_id` set. 00006 gives exactly two tables a policy that permits
-- that — users and auth_sessions, the auth substrate — and every other table,
-- user_settings included, matches no rows at all without it. A LEFT JOIN onto
-- user_settings from that query therefore returns NULL for every account, and
-- the only ways to make it work are to weaken the policy on a table that holds
-- real preferences, or to move the column. Weakening it would open every
-- account's preferences to any unscoped query — which is the guarantee D-059
-- forced RLS on to make, and a language setting is not worth spending it.
--
-- So the column joins the auth substrate, and it belongs there on its own
-- merits: 00013 put suspended_at on users for the same reason — not because
-- suspension is identity, but because requireNotSuspended reads it on every
-- request and the row is already in hand. The locale is now the same kind of
-- fact. What stays on user_settings is what only a preferences screen reads.
--
-- It is still presented as a preference: GET/PATCH /api/settings carries it
-- beside the timer default, and the two writes commit in one transaction.

-- +goose Up
-- +goose StatementBegin

-- NULL means "no explicit choice", and the whole resolution order depends on
-- that being a real state rather than a synonym for 'id'.
--
-- Defaulting this to 'id' would look tidier and would quietly delete the
-- middle step of D-094: every account would have a setting from the moment it
-- was created, Accept-Language would never be consulted for anyone signed in,
-- and a person who signed up from an English browser would watch the app
-- repaint itself into Indonesian the instant /auth/me answered. That is the
-- D-086 flash with words instead of colours, which is worse — a wrong colour
-- is noticed, a wrong language is *read*.
--
-- So NULL is the default and existing rows are not backfilled. Every account
-- created before this migration has never been asked, which is exactly what
-- NULL says. Note the consequence, because it is a visible behaviour change on
-- deploy rather than a silent one: an existing account whose browser asks for
-- English will be served English on the next load, and the Preferensi screen
-- is where they say otherwise.
--
-- CHECK rather than an enum type. Two values is not a domain worth a type, and
-- a text CHECK is the same constraint with a migration that stays one ALTER.
-- The list is duplicated in internal/i18n/locale.go and web/src/i18n/types.ts;
-- locale_test.go's TestLocalesMatchTheFrontend is what notices when those two
-- drift, and this constraint is what makes a drifted value unstorable rather
-- than merely wrong (hard rule 9).
ALTER TABLE users
    ADD COLUMN locale text CHECK (locale IN ('id', 'en'));

-- No index, for the reason 00010 and 00013 both state: nothing looks an
-- account up *by* this column. Every read of it comes from a row already
-- fetched by id or by email, both unique-indexed already. The one query that
-- would want an index — "how many accounts read English" — is not built, and
-- hard rule 11 is why it never will be.
--
-- No RLS change: 00006 already policies users, and this is a column on a table
-- that is already protected.

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE users DROP COLUMN locale;

-- +goose StatementEnd
