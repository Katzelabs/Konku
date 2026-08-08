-- +goose Up
-- +goose StatementBegin

-- ---------------------------------------------------------------------------
-- 1. Auth sessions get an unambiguous name.
--
-- `sessions` meant server-side auth sessions; focus sessions live in
-- `focus_sessions`. With exams and per-user domains arriving, "which sessions
-- table" stops being a joke and starts being a bug.
-- ---------------------------------------------------------------------------
ALTER TABLE sessions RENAME TO auth_sessions;
ALTER INDEX sessions_pkey            RENAME TO auth_sessions_pkey;
ALTER INDEX sessions_user_id_idx     RENAME TO auth_sessions_user_id_idx;
ALTER INDEX sessions_expires_at_idx  RENAME TO auth_sessions_expires_at_idx;

-- ---------------------------------------------------------------------------
-- 2. Domains become per-user (supersedes D-015 / D-034's global catalogue).
--
-- The key shape decision: a surrogate uuid PK plus UNIQUE (user_id, slug),
-- NOT a composite (user_id, slug) primary key. A composite PK would propagate
-- a two-column natural FK into notes, focus_sessions and exams, and every one
-- of those would then have to carry the slug. The uuid keeps every reference
-- one column wide while the slug stays available for seeding and URLs.
--
-- UNIQUE (user_id, id) is redundant against the PK, and deliberate: it is the
-- target every cross-tenant composite FK below points at. See §3.
-- ---------------------------------------------------------------------------
CREATE TABLE domains_new (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug         text NOT NULL,
    label        text NOT NULL,
    color        text NOT NULL,
    -- 0 means the domain is a valid tag but sits outside the weekly rota
    -- (D-034, for coding).
    weekly_quota int  NOT NULL DEFAULT 0,
    sort_order   int  NOT NULL DEFAULT 0,
    -- Soft archive, never delete. A deleted domain orphans notes and empties
    -- focus sessions of the one fact they record. Same reasoning as card
    -- soft-delete (D-019): history outlives the thing it points at.
    archived_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, slug),
    UNIQUE (user_id, id)
);

-- Every existing user inherits a private copy of the seeded catalogue.
INSERT INTO domains_new (user_id, slug, label, color, weekly_quota, sort_order)
SELECT u.id, d.id, d.label, d.color, d.weekly_quota,
       row_number() OVER (PARTITION BY u.id ORDER BY d.weekly_quota DESC, d.id)
FROM users u CROSS JOIN domains d;

-- Repoint notes by slug, then drop the old text column (which takes the FK to
-- the global table with it).
ALTER TABLE notes ADD COLUMN domain_uuid uuid;
UPDATE notes n
   SET domain_uuid = dn.id
  FROM domains_new dn
 WHERE dn.user_id = n.user_id AND dn.slug = n.domain_id;
ALTER TABLE notes DROP COLUMN domain_id;
ALTER TABLE notes RENAME COLUMN domain_uuid TO domain_id;

ALTER TABLE focus_sessions ADD COLUMN domain_uuid uuid;
UPDATE focus_sessions f
   SET domain_uuid = dn.id
  FROM domains_new dn
 WHERE dn.user_id = f.user_id AND dn.slug = f.domain_id;
ALTER TABLE focus_sessions DROP COLUMN domain_id;
ALTER TABLE focus_sessions RENAME COLUMN domain_uuid TO domain_id;

DROP TABLE domains;
ALTER TABLE domains_new RENAME TO domains;
ALTER INDEX domains_new_pkey             RENAME TO domains_pkey;
ALTER INDEX domains_new_user_id_slug_key RENAME TO domains_user_id_slug_key;
ALTER INDEX domains_new_user_id_id_key   RENAME TO domains_user_id_id_key;

CREATE INDEX domains_user_id_idx ON domains (user_id) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Tenancy is enforced by the foreign key, not by handler discipline.
--
-- `notes.domain_id -> domains.id` alone would let an unvalidated domain_id in
-- a request body attach one user's note to another user's domain: the FK is
-- satisfied, the WHERE clause never sees it, and hard rule 4 is bypassed one
-- level down. Every reference below therefore carries user_id and points at
-- UNIQUE (user_id, id).
--
-- MATCH SIMPLE (the default) is what makes optional references still work: a
-- NULL domain_id satisfies the constraint regardless of user_id.
-- ---------------------------------------------------------------------------
-- ON DELETE NO ACTION is explicit, not a leftover default: a domain with notes
-- or sessions attached cannot be deleted, only archived. An unreferenced
-- domain — one created by mistake — still deletes cleanly, so both cases work
-- without a policy. Handlers must map foreign_key_violation to a 409, not a
-- 500.
ALTER TABLE notes
    ADD CONSTRAINT notes_domain_fkey
    FOREIGN KEY (user_id, domain_id) REFERENCES domains (user_id, id)
    ON DELETE NO ACTION;

ALTER TABLE focus_sessions
    ADD CONSTRAINT focus_sessions_domain_fkey
    FOREIGN KEY (user_id, domain_id) REFERENCES domains (user_id, id)
    ON DELETE NO ACTION;

CREATE INDEX notes_domain_idx          ON notes (user_id, domain_id);
CREATE INDEX focus_sessions_domain_idx ON focus_sessions (user_id, domain_id, session_date DESC);

-- Cards are addressed by (note_id, id). Referencing them from exam_cards needs
-- the owner in the key too, for the same reason as above.
ALTER TABLE cards ADD CONSTRAINT cards_user_note_id_key UNIQUE (user_id, note_id, id);

-- ---------------------------------------------------------------------------
-- 4. Exams: a practice test defined once and sat many times.
--
-- 'fixed'  — the card set is pinned in exam_cards. Scores are comparable
--            across attempts because the questions are identical.
-- 'random' — question_count cards are drawn from the domain at attempt time.
--            Better practice, non-comparable scores. Which cards were drawn is
--            recoverable from the attempt's review_logs rows.
-- The CHECK ties question_count to exactly the mode that uses it.
-- ---------------------------------------------------------------------------
CREATE TABLE exams (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- NULL means the exam draws from the whole knowledge base.
    domain_id      uuid,
    title          text NOT NULL,
    description    text NOT NULL DEFAULT '',
    selection      text NOT NULL DEFAULT 'random'
                        CHECK (selection IN ('fixed', 'random')),
    question_count int,
    -- NULL = untimed. A time limit is a constraint the user chose, not one the
    -- app imposes (rule 6).
    time_limit_minutes int CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
    archived_at    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, domain_id) REFERENCES domains (user_id, id)
        ON DELETE NO ACTION,
    CHECK ((selection = 'random') = (question_count IS NOT NULL)),
    CHECK (question_count IS NULL OR question_count > 0)
);
CREATE INDEX exams_user_idx   ON exams (user_id) WHERE archived_at IS NULL;
CREATE INDEX exams_domain_idx ON exams (user_id, domain_id);

-- The pinned card set for selection = 'fixed'. Empty for 'random'.
CREATE TABLE exam_cards (
    exam_id  uuid NOT NULL,
    user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id  uuid NOT NULL,
    card_id  text NOT NULL,
    position int  NOT NULL DEFAULT 0,
    PRIMARY KEY (exam_id, note_id, card_id),
    FOREIGN KEY (user_id, exam_id) REFERENCES exams (user_id, id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, note_id, card_id)
        REFERENCES cards (user_id, note_id, id) ON DELETE CASCADE
);
CREATE INDEX exam_cards_user_idx ON exam_cards (user_id);

-- One sitting. finished_at NULL means in progress; the partial unique index
-- makes a second open attempt on the same exam impossible.
CREATE TABLE exam_attempts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id       uuid NOT NULL,
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    -- Local YYYY-MM-DD (rule 5): an attempt at 11pm belongs to that day. Like
    -- focus_sessions.session_date it is supplied by the client, because only
    -- the client knows the user's timezone — see the ±26h validation in
    -- internal/api/sessions.go, which this needs too.
    attempt_date  date NOT NULL,
    -- Denormalised at finish so the attempt history list never aggregates.
    total_count   int NOT NULL DEFAULT 0,
    correct_count int NOT NULL DEFAULT 0,
    UNIQUE (user_id, id),
    -- NO ACTION, not CASCADE: deleting an exam must not silently destroy the
    -- score history of every attempt at it while the individual answers
    -- survive in review_logs. Exams archive, same as domains.
    FOREIGN KEY (user_id, exam_id) REFERENCES exams (user_id, id)
        ON DELETE NO ACTION,
    CHECK (correct_count >= 0 AND correct_count <= total_count),
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);
CREATE UNIQUE INDEX exam_attempts_one_open_idx
    ON exam_attempts (user_id, exam_id) WHERE finished_at IS NULL;
CREATE INDEX exam_attempts_user_idx ON exam_attempts (user_id, started_at DESC);
CREATE INDEX exam_attempts_exam_idx ON exam_attempts (exam_id, attempt_date DESC);

-- The question set as it was when the attempt started, in presentation order.
--
-- Without this an attempt cannot be resumed: for a 'random' exam the draw
-- exists only in memory, so closing the tab halfway loses the unanswered
-- questions, and for a 'fixed' exam an edit to exam_cards between attempts
-- would silently change what the scores are comparing.
--
-- Which questions remain is exam_attempt_cards LEFT JOIN review_logs on
-- (exam_attempt_id, note_id, card_id) WHERE the log row is absent. The answer
-- itself is never stored here — review_logs owns that (§5).
--
-- No foreign key to cards, deliberately, and for the same reason review_logs
-- has none: this is history, and a hard-deleted note must not take a finished
-- attempt's question list with it. That trades FK-enforced tenancy for
-- durability on this one table; the composite FK to exam_attempts still pins
-- the owner, and rows are only ever inserted from a user-scoped SELECT.
CREATE TABLE exam_attempt_cards (
    attempt_id uuid NOT NULL,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id    uuid NOT NULL,
    card_id    text NOT NULL,
    position   int  NOT NULL,
    PRIMARY KEY (attempt_id, note_id, card_id),
    UNIQUE (attempt_id, position),
    FOREIGN KEY (user_id, attempt_id)
        REFERENCES exam_attempts (user_id, id) ON DELETE CASCADE
);
CREATE INDEX exam_attempt_cards_user_idx ON exam_attempt_cards (user_id);

-- ---------------------------------------------------------------------------
-- 5. review_logs carries exam answers too. There is no exam_answers table.
--
-- An exam answer IS a review — same card, same ingat/lupa vocabulary, same
-- retention evidence. Giving it a separate table would make every retention
-- query a UNION forever, against D-029's whole point.
--
-- What an exam answer does NOT do is move card_schedules. Advancing the ladder
-- on a card that was not due would scramble the capped oldest-first due list
-- (D-009), and a `lupa` in a mock test resetting a month of real progress is a
-- punishment mechanic (rule 6). So for source = 'exam', interval_before and
-- interval_after are written equal: the schedule did not move.
--
-- ON DELETE SET NULL on the attempt column only (PG 15+): discarding an
-- attempt must not delete retention history. source stays 'exam', so such a
-- row reads as "an exam answer whose attempt was discarded".
-- ---------------------------------------------------------------------------
ALTER TABLE review_logs
    ADD COLUMN source text NOT NULL DEFAULT 'review'
        CHECK (source IN ('review', 'exam')),
    ADD COLUMN exam_attempt_id uuid;

ALTER TABLE review_logs
    ADD CONSTRAINT review_logs_attempt_fkey
        FOREIGN KEY (user_id, exam_attempt_id)
        REFERENCES exam_attempts (user_id, id)
        ON DELETE SET NULL (exam_attempt_id),
    ADD CONSTRAINT review_logs_exam_source_chk
        CHECK (exam_attempt_id IS NULL OR source = 'exam');

CREATE INDEX review_logs_attempt_idx
    ON review_logs (exam_attempt_id) WHERE exam_attempt_id IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Lossy by nature: per-user domains collapse back to one global catalogue, so
-- any domain a user created beyond the seeded five is dropped, and notes or
-- sessions tagged with it become untagged.

DROP TABLE IF EXISTS exam_attempt_cards;
DROP TABLE IF EXISTS exam_cards;

ALTER TABLE review_logs
    DROP CONSTRAINT IF EXISTS review_logs_attempt_fkey,
    DROP CONSTRAINT IF EXISTS review_logs_exam_source_chk;
DROP INDEX IF EXISTS review_logs_attempt_idx;
ALTER TABLE review_logs
    DROP COLUMN IF EXISTS exam_attempt_id,
    DROP COLUMN IF EXISTS source;

DROP TABLE IF EXISTS exam_attempts;
DROP TABLE IF EXISTS exams;

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_user_note_id_key;

ALTER TABLE notes          DROP CONSTRAINT IF EXISTS notes_domain_fkey;
ALTER TABLE focus_sessions DROP CONSTRAINT IF EXISTS focus_sessions_domain_fkey;
DROP INDEX IF EXISTS notes_domain_idx;
DROP INDEX IF EXISTS focus_sessions_domain_idx;

CREATE TABLE domains_old (
    id           text PRIMARY KEY,
    label        text NOT NULL,
    color        text NOT NULL,
    weekly_quota int  NOT NULL DEFAULT 0
);
INSERT INTO domains_old (id, label, color, weekly_quota)
SELECT DISTINCT ON (slug) slug, label, color, weekly_quota
FROM domains ORDER BY slug, created_at;

ALTER TABLE notes ADD COLUMN domain_slug text;
UPDATE notes n SET domain_slug = d.slug FROM domains d WHERE d.id = n.domain_id;
ALTER TABLE notes DROP COLUMN domain_id;
ALTER TABLE notes RENAME COLUMN domain_slug TO domain_id;

ALTER TABLE focus_sessions ADD COLUMN domain_slug text;
UPDATE focus_sessions f SET domain_slug = d.slug FROM domains d WHERE d.id = f.domain_id;
ALTER TABLE focus_sessions DROP COLUMN domain_id;
ALTER TABLE focus_sessions RENAME COLUMN domain_slug TO domain_id;

DROP TABLE domains;
ALTER TABLE domains_old RENAME TO domains;
ALTER INDEX domains_old_pkey RENAME TO domains_pkey;

ALTER TABLE notes          ADD CONSTRAINT notes_domain_id_fkey          FOREIGN KEY (domain_id) REFERENCES domains(id);
ALTER TABLE focus_sessions ADD CONSTRAINT focus_sessions_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES domains(id);

ALTER INDEX auth_sessions_expires_at_idx RENAME TO sessions_expires_at_idx;
ALTER INDEX auth_sessions_user_id_idx    RENAME TO sessions_user_id_idx;
ALTER INDEX auth_sessions_pkey           RENAME TO sessions_pkey;
ALTER TABLE auth_sessions RENAME TO sessions;

-- +goose StatementEnd
