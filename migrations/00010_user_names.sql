-- Names on an account.
--
-- Until now an account was an email address and nothing else, which is fine
-- for one person and wrong the moment the app addresses anyone. Every screen
-- that wanted to name the user showed the raw address, and every mail did too
-- — "Halo hrofiyani@gmail.com" is the tell of software that does not know who
-- it is talking to.
--
-- Both columns are NOT NULL DEFAULT '' rather than nullable.
--
-- The distinction a nullable column would carry here is "we never asked" vs
-- "they left it blank", and nothing in the product does anything different
-- with those two. What it would cost is real: every read site becomes a nil
-- check, and internal/store/gen emits *string for a nullable text
-- (emit_pointers_for_null_types), so the pointer would spread through the
-- handler, the response type and the export. An empty string already means
-- "not given" unambiguously, because a name of "" is not a name.
--
-- So existing accounts — the seeded ones, created before signup collected
-- this — backfill to '' and the UI falls back to the email address for them.
-- That is deliberately not a migration that invents names out of local-parts:
-- guessing "hrofiyani" is someone's first name and then greeting them by it
-- is worse than the fallback.

-- +goose Up
-- +goose StatementBegin

-- Given name. Required at signup, which the handler enforces — not a CHECK.
--
-- A CHECK (first_name <> '') would apply to the backfilled rows above and to
-- `konku seed-user`, neither of which has a name to give, so the constraint
-- would have to be violated on the way in or worked around at the only two
-- places that create a user. The rule "public signup asks for a name" belongs
-- to public signup.
ALTER TABLE users ADD COLUMN first_name text NOT NULL DEFAULT '';

-- Family name, genuinely optional. Plenty of people have one name, and a form
-- that refuses to accept that is a form that tells them they are wrong about
-- their own name.
ALTER TABLE users ADD COLUMN last_name text NOT NULL DEFAULT '';

-- Length is bounded in the database as well as in the handler (hard rule 9:
-- two mechanisms, or it is a hope). The handler's limit is what produces a
-- readable Indonesian error; this one is what holds if a future call site
-- forgets to validate. 80 is well past any real name and well short of a row
-- worth worrying about.
ALTER TABLE users ADD CONSTRAINT users_first_name_length CHECK (length(first_name) <= 80);
ALTER TABLE users ADD CONSTRAINT users_last_name_length  CHECK (length(last_name)  <= 80);

-- No index. Names are never looked up by, only displayed — search is over note
-- titles and nothing else (D-031), and there is no directory of users to
-- search because there is no social surface (GOALS.md).
--
-- No RLS change either: 00006 already policies `users`, and these are columns
-- on a table that is already protected rather than a new table needing a
-- grant.

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_last_name_length;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_first_name_length;
ALTER TABLE users DROP COLUMN last_name;
ALTER TABLE users DROP COLUMN first_name;

-- +goose StatementEnd
