-- +goose Up
-- +goose StatementBegin

-- Extensions are enabled at database creation (D-025); this is a no-op if the
-- provisioning step already ran them, and makes a fresh dev database work.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,          -- argon2id, encoded form
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Server-side sessions rather than signed cookies, so logout actually
-- revokes access (D-039).
CREATE TABLE sessions (
    id         text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Domains are global reference data, not per-user. weekly_quota 0 means the
-- domain is a valid tag but sits outside the weekly rota (D-034, for coding).
CREATE TABLE domains (
    id           text PRIMARY KEY,
    label        text NOT NULL,
    color        text NOT NULL,
    weekly_quota int  NOT NULL DEFAULT 0
);

CREATE TABLE notes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      text NOT NULL,
    content_md text NOT NULL DEFAULT '',
    domain_id  text REFERENCES domains(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    tsv        tsvector GENERATED ALWAYS AS (
                   setweight(to_tsvector('simple', coalesce(title, '')),      'A') ||
                   setweight(to_tsvector('simple', coalesce(content_md, '')), 'B')
               ) STORED
);
CREATE INDEX notes_user_id_idx    ON notes (user_id);
CREATE INDEX notes_tsv_idx        ON notes USING gin (tsv);
CREATE INDEX notes_title_trgm_idx ON notes USING gin (title gin_trgm_ops);

-- id is the stable ID embedded in the note markdown as <!-- c:xxxx -->, not a
-- surrogate key: matching cards by content would destroy review history on a
-- typo fix (D-019).
--
-- user_id is denormalised here and on every table below even though it is
-- reachable through note_id. Deliberate: it keeps every scoped query a single
-- indexed predicate instead of a join-to-check, and makes RLS a drop-in later.
CREATE TABLE cards (
    id         text NOT NULL,
    note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       text NOT NULL CHECK (type IN ('basic', 'cloze', 'feynman')),
    front      text NOT NULL,
    back       text NOT NULL DEFAULT '',
    line       int  NOT NULL DEFAULT 0,
    -- Soft delete: a card whose ID vanishes from the markdown must not take
    -- months of review history with it (D-019).
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (note_id, id)
);
CREATE INDEX cards_user_id_idx ON cards (user_id);
CREATE INDEX cards_note_id_idx ON cards (note_id);

CREATE TABLE card_schedules (
    note_id          uuid NOT NULL,
    card_id          text NOT NULL,
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage            int  NOT NULL DEFAULT 0,
    -- Local YYYY-MM-DD, never a timestamp: an 11pm session belongs to that
    -- day. NULL once mastered, meaning "not scheduled".
    next_review_date date,
    lapses           int  NOT NULL DEFAULT 0,
    state            text NOT NULL DEFAULT 'learning'
                          CHECK (state IN ('learning', 'mastered')),
    PRIMARY KEY (note_id, card_id),
    FOREIGN KEY (note_id, card_id) REFERENCES cards(note_id, id) ON DELETE CASCADE
);
-- The due-list query: scoped by user, learning only, ordered oldest-first.
CREATE INDEX card_schedules_due_idx
    ON card_schedules (user_id, next_review_date)
    WHERE state = 'learning';

-- Written on EVERY review. The retention metric cannot be reconstructed
-- retroactively, which is why this table exists before the feature does
-- (D-029).
CREATE TABLE review_logs (
    id              bigserial PRIMARY KEY,
    note_id         uuid NOT NULL,
    card_id         text NOT NULL,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating          text NOT NULL CHECK (rating IN ('ingat', 'lupa')),
    interval_before int  NOT NULL DEFAULT 0,
    interval_after  int  NOT NULL DEFAULT 0,
    reviewed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_logs_user_reviewed_idx ON review_logs (user_id, reviewed_at DESC);
CREATE INDEX review_logs_card_idx          ON review_logs (note_id, card_id);

CREATE TABLE focus_sessions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_id        text REFERENCES domains(id),
    duration_minutes int  NOT NULL,
    -- The local day the session belongs to, stored explicitly so streaks and
    -- quotas never depend on timezone maths at query time.
    session_date     date NOT NULL,
    completed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX focus_sessions_user_date_idx ON focus_sessions (user_id, session_date DESC);

INSERT INTO domains (id, label, color, weekly_quota) VALUES
    ('general',    'Pengetahuan Umum', '#4F7CAC', 3),
    ('math',       'Matematika',       '#6A8D73', 2),
    ('psychology', 'Psikologi',        '#B08968', 1),
    ('music',      'Musik',            '#8E7DBE', 1),
    ('coding',     'Coding',           '#5C6B73', 0);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS focus_sessions;
DROP TABLE IF EXISTS review_logs;
DROP TABLE IF EXISTS card_schedules;
DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS domains;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
-- +goose StatementEnd
