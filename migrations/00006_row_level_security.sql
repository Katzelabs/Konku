-- Row-level security (D-059).
--
-- D-039 deferred this as "worth doing, not worth blocking the MVP on". Correct
-- then: the only data a scoping bug could leak was the operator's own. With
-- strangers' notes in the same tables, one forgotten `WHERE user_id` stops
-- being a bug and becomes a breach that has to be disclosed.
--
-- The application `WHERE user_id` predicate STAYS. Two independent mechanisms
-- is the entire point (hard rule 9); RLS instead of the predicate is not
-- obviously safer than the predicate alone.
--
-- Three things make the difference between RLS and the appearance of it:
--
--   1. FORCE ROW LEVEL SECURITY. A table owner bypasses its own policies by
--      default, so without FORCE every policy below is inert and every naive
--      test of them passes.
--   2. A non-owner role. FORCE does not apply to SUPERUSER or BYPASSRLS
--      roles, and the dev database's `konku` is both — it is the bootstrap
--      user the Postgres image creates. Connecting as `konku` leaves RLS
--      completely inert no matter what this file says.
--   3. Explicit grants, and deliberately NO `ALTER DEFAULT PRIVILEGES`. A
--      blanket default grant means a future table is readable by the app the
--      moment it is created — before anyone remembers to give it a policy.
--      That is precisely backwards. A new table should be inaccessible until
--      someone writes its policy, and TestEveryUserTableIsProtected fails
--      until they do.

-- +goose Up

-- The role is created here so its existence is guaranteed by the schema, but
-- with NOLOGIN and no password: a credential in a migration is a credential in
-- git. `make db-app-role` (dev) or the operator (prod) grants LOGIN and sets
-- the password separately.
-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'konku_app') THEN
        CREATE ROLE konku_app NOLOGIN;
    END IF;
END
$$;
-- +goose StatementEnd

GRANT USAGE ON SCHEMA public TO konku_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    users,
    auth_sessions,
    notes,
    cards,
    card_schedules,
    review_logs,
    focus_sessions,
    domains,
    categories,
    note_categories,
    card_categories,
    exams,
    exam_cards,
    exam_attempts,
    exam_attempt_cards
TO konku_app;

-- review_logs has a bigserial id, so INSERT needs the sequence too.
GRANT USAGE, SELECT ON SEQUENCE review_logs_id_seq TO konku_app;

-- Read-only, and only because /readyz compares the live schema version with
-- the one the process migrated to. The app must never write migration state.
GRANT SELECT ON goose_db_version TO konku_app;

-- Every table whose rows belong to exactly one user, keyed by user_id.
--
-- A loop rather than 42 hand-written statements: the point of a policy set is
-- that it is uniform, and uniformity written out by hand is uniformity until
-- someone fat-fingers one table. The list is explicit so adding a table is a
-- deliberate act.
--
-- current_setting('app.user_id', true) — the two-argument form returns NULL
-- when the setting is absent instead of raising, and NULLIF catches the empty
-- string, which would raise on the ::uuid cast. Unset therefore means "matches
-- no row", so a query that forgets to open a user transaction returns nothing
-- rather than everything. Fail closed.
--
-- WITH CHECK as well as USING: USING filters what you can see, WITH CHECK
-- constrains what you can write. Without it, an UPDATE could move a row into
-- another user's account. D-047's composite foreign keys are the other
-- mechanism for that.
-- +goose StatementBegin
DO $$
DECLARE
    t text;
    owned text[] := ARRAY[
        'notes', 'cards', 'card_schedules', 'review_logs', 'focus_sessions',
        'domains', 'categories', 'note_categories', 'card_categories',
        'exams', 'exam_cards', 'exam_attempts', 'exam_attempt_cards'
    ];
BEGIN
    FOREACH t IN ARRAY owned LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format($p$
            CREATE POLICY %1$I_tenant ON %1$I
                USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
                WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
        $p$, t);
    END LOOP;
END
$$;
-- +goose StatementEnd

-- users and auth_sessions are the auth substrate, and they are read BEFORE
-- there is a user to scope by: resolving a session is what produces the
-- identity that every other policy depends on. So they scope when app.user_id
-- is set and permit when it is not (D1).
--
-- Stated honestly: the unset branch is a hole, and it is the auth path's hole.
-- What it buys is that an *authenticated* request — every request that reaches
-- a normal handler — still cannot read another account's sessions or password
-- hash, which is the exposure that actually matters. The session id remains
-- the credential it always was.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_tenant ON users
    USING (
        NULLIF(current_setting('app.user_id', true), '') IS NULL
        OR id = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
    WITH CHECK (
        NULLIF(current_setting('app.user_id', true), '') IS NULL
        OR id = NULLIF(current_setting('app.user_id', true), '')::uuid
    );

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_sessions_tenant ON auth_sessions
    USING (
        NULLIF(current_setting('app.user_id', true), '') IS NULL
        OR user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
    WITH CHECK (
        NULLIF(current_setting('app.user_id', true), '') IS NULL
        OR user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    );

-- +goose Down

-- +goose StatementBegin
DO $$
DECLARE
    t text;
    all_tables text[] := ARRAY[
        'users', 'auth_sessions',
        'notes', 'cards', 'card_schedules', 'review_logs', 'focus_sessions',
        'domains', 'categories', 'note_categories', 'card_categories',
        'exams', 'exam_cards', 'exam_attempts', 'exam_attempt_cards'
    ];
BEGIN
    FOREACH t IN ARRAY all_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS %1$I_tenant ON %1$I', t);
        EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    END LOOP;
END
$$;
-- +goose StatementEnd

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM konku_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM konku_app;
REVOKE USAGE ON SCHEMA public FROM konku_app;

-- The role itself is deliberately NOT dropped: other databases on a shared
-- instance may have granted it something, and DROP ROLE fails anyway while any
-- grant remains. Leaving a LOGIN-less role behind is harmless.
