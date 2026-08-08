-- +goose Up
-- +goose StatementBegin

-- ---------------------------------------------------------------------------
-- DESTRUCTIVE. Every card, schedule, review log and exam question set is
-- dropped, not migrated.
--
-- Cards were addressed by (note_id, card_id) where card_id was the `c:xxxx`
-- marker the parser wrote into the markdown. Standalone cards are addressed by
-- a uuid. There is no mapping between the two — the old identifier was only
-- ever meaningful inside a note body — so rows keyed on it cannot be carried
-- across.
--
-- This is only acceptable because the app has not shipped (04-ship is entirely
-- `todo`) and the data is development data. review_logs in particular cannot
-- be reconstructed once it holds anything real (D-029), so this migration is
-- free exactly once, and this is that moment.
--
-- See D-055 for why cards left the markdown at all.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Tear down everything keyed on (note_id, card_id).
--
-- Order follows the foreign keys: card_schedules and exam_cards both reference
-- cards, so they go first. exam_attempt_cards has no FK to cards — deliberate,
-- see §5 — but its primary key carries note_id, so it is rebuilt too.
-- ---------------------------------------------------------------------------
DROP TABLE exam_attempt_cards;
DROP TABLE exam_cards;
DROP TABLE card_schedules;
DROP TABLE cards;

-- Attempts survive the tables above, which would leave them scoring a question
-- set that no longer exists: a finished attempt reading 7/10 with zero
-- questions behind it. Cleared rather than left to read as corrupt history.
DELETE FROM exam_attempts;

-- ---------------------------------------------------------------------------
-- 2. Cards stand on their own.
--
-- `line` is gone: it recorded which markdown line the card was parsed from,
-- and there is no markdown left to point at.
--
-- domain_id is NOT optional to get right. Cards had no domain of their own —
-- they inherited it by joining notes, in DrawRandomCards and
-- ListCardsForPicking. Without this column, dropping note_id would leave every
-- exam draw and the Cards page filter with nothing to filter on, and the
-- failure would be an empty list rather than an error.
--
-- The composite FK is D-047: `domain_id -> domains.id` alone would let an
-- unvalidated domain_id in a request body attach this user's card to another
-- user's domain.
-- ---------------------------------------------------------------------------
CREATE TABLE cards (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- NULL means the card is untagged. Capture must never block on a decision
    -- the user has not made yet (hard rule 7).
    domain_id  uuid,
    -- Only 'basic' is ever written. Cloze and feynman stay deferred (D-031);
    -- leaving the constraint as it was means v0.2 needs no migration.
    type       text NOT NULL DEFAULT 'basic'
                    CHECK (type IN ('basic', 'cloze', 'feynman')),
    -- Multi-line markdown now. Both sides were single-line strings only
    -- because the parser rejected newlines outright, and the parser is gone.
    front      text NOT NULL,
    back       text NOT NULL DEFAULT '',
    -- Soft delete survives the split, for a new reason. The D-019 reason is
    -- gone: a card no longer vanishes because someone deleted a line. But
    -- ListAttemptQuestions LEFT JOINs cards to render a finished attempt's
    -- questions, so a hard delete would blank out past exam results. It also
    -- makes deletion undoable, which a destructive button on a CRUD screen
    -- wants to be.
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, domain_id) REFERENCES domains (user_id, id)
        ON DELETE NO ACTION
);
CREATE INDEX cards_user_idx   ON cards (user_id) WHERE deleted_at IS NULL;
CREATE INDEX cards_domain_idx ON cards (user_id, domain_id);
-- The Cards page filters on the prompt side, the same way notes filter on
-- title. pg_trgm was enabled in 00001.
CREATE INDEX cards_front_trgm_idx ON cards USING gin (front gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. One schedule per card, and now that is literally the primary key.
--
-- The FK is composite for the D-047 reason and CASCADE because a schedule
-- without its card is not history, it is a dangling row: every fact worth
-- keeping lives in review_logs.
-- ---------------------------------------------------------------------------
CREATE TABLE card_schedules (
    card_id          uuid PRIMARY KEY,
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage            int  NOT NULL DEFAULT 0,
    -- Local YYYY-MM-DD, never a timestamp (hard rule 5). NULL once mastered,
    -- meaning "not scheduled".
    next_review_date date,
    lapses           int  NOT NULL DEFAULT 0,
    state            text NOT NULL DEFAULT 'learning'
                          CHECK (state IN ('learning', 'mastered')),
    FOREIGN KEY (user_id, card_id) REFERENCES cards (user_id, id)
        ON DELETE CASCADE
);
-- The due-list query: scoped by user, learning only, ordered oldest-first.
CREATE INDEX card_schedules_due_idx
    ON card_schedules (user_id, next_review_date)
    WHERE state = 'learning';

-- ---------------------------------------------------------------------------
-- 4. review_logs is altered rather than recreated.
--
-- Its rows go — they name cards that no longer exist — but the table keeps the
-- attempt foreign key, the source CHECK and its bigserial sequence, all added
-- in 00002. Restating those in full is three more chances to get a constraint
-- subtly wrong for no gain.
--
-- Still no foreign key to cards, deliberately and unchanged: this is history,
-- and a hard-deleted card must not take the evidence that it was once
-- remembered with it.
-- ---------------------------------------------------------------------------
DELETE FROM review_logs;

DROP INDEX review_logs_card_idx;
DROP INDEX review_logs_one_answer_per_attempt_idx;

ALTER TABLE review_logs
    DROP COLUMN note_id,
    DROP COLUMN card_id;
-- NOT NULL without a default is only possible because the table is empty.
ALTER TABLE review_logs
    ADD COLUMN card_id uuid NOT NULL;

CREATE INDEX review_logs_card_idx ON review_logs (card_id);

-- Partial, because ordinary reviews are supposed to repeat: the same card is
-- rated again every time it comes due. The constraint applies only to rows
-- belonging to an attempt, where a double-clicked rating would otherwise score
-- 11/10 (00003).
CREATE UNIQUE INDEX review_logs_one_answer_per_attempt_idx
    ON review_logs (exam_attempt_id, card_id)
    WHERE exam_attempt_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Exam question sets, one column narrower.
-- ---------------------------------------------------------------------------

-- The pinned card set for selection = 'fixed'. Empty for 'random'.
CREATE TABLE exam_cards (
    exam_id  uuid NOT NULL,
    user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id  uuid NOT NULL,
    position int  NOT NULL DEFAULT 0,
    PRIMARY KEY (exam_id, card_id),
    FOREIGN KEY (user_id, exam_id) REFERENCES exams (user_id, id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, card_id) REFERENCES cards (user_id, id) ON DELETE CASCADE
);
CREATE INDEX exam_cards_user_idx ON exam_cards (user_id);

-- The question set as it was when the attempt started, in presentation order.
-- Without it an attempt cannot be resumed (D-050).
--
-- No foreign key to cards, deliberately, for the same reason review_logs has
-- none: a deleted card must not take a finished attempt's question list with
-- it. The composite FK to exam_attempts still pins the owner, and rows are
-- only ever inserted from a user-scoped SELECT.
CREATE TABLE exam_attempt_cards (
    attempt_id uuid NOT NULL,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id    uuid NOT NULL,
    position   int  NOT NULL,
    PRIMARY KEY (attempt_id, card_id),
    UNIQUE (attempt_id, position),
    FOREIGN KEY (user_id, attempt_id)
        REFERENCES exam_attempts (user_id, id) ON DELETE CASCADE
);
CREATE INDEX exam_attempt_cards_user_idx ON exam_attempt_cards (user_id);

-- ---------------------------------------------------------------------------
-- 6. Categories: one shared vocabulary, two join tables.
--
-- Categories are not domains. A domain is exactly one per note or card, drives
-- the weekly rota and exam draws, and carries a colour. A category is many per
-- note or card, means nothing to the scheduler, and exists to organise.
--
-- Flat, with '/' permitted in the slug ('math/aljabar'), so nesting becomes a
-- display decision later rather than a migration.
--
-- No colour column. Domain colour is the one colour signal in a row and a
-- second one competing with it is noise; D-054 kept the palette narrow on
-- purpose. Categories render as neutral chips.
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug        text NOT NULL,
    label       text NOT NULL,
    -- Soft archive, same reasoning as domains and exams (D-051): a category
    -- that stops being useful should leave the picker without detaching itself
    -- from everything it ever labelled.
    archived_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, slug),
    UNIQUE (user_id, id)
);
CREATE INDEX categories_user_idx ON categories (user_id) WHERE archived_at IS NULL;

-- notes never had this. cards got the equivalent in 00002 and domains and
-- exams were born with it; notes were only ever pointed *at*, never *from*.
-- note_categories cannot follow D-047 without it.
ALTER TABLE notes ADD CONSTRAINT notes_user_id_id_key UNIQUE (user_id, id);

-- Both join tables follow the same rule, and the two halves differ on purpose:
--
--   note_id / card_id  ON DELETE CASCADE — deleting the thing removes its
--                      labels, which are not history.
--   category_id        ON DELETE NO ACTION — a category still in use cannot be
--                      deleted, only archived. Handlers map
--                      foreign_key_violation to a 409, never a 500 (D-051).
CREATE TABLE note_categories (
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id     uuid NOT NULL,
    category_id uuid NOT NULL,
    PRIMARY KEY (note_id, category_id),
    FOREIGN KEY (user_id, note_id)     REFERENCES notes (user_id, id)      ON DELETE CASCADE,
    FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id) ON DELETE NO ACTION
);
-- The reverse lookup: every note carrying a given category.
CREATE INDEX note_categories_category_idx ON note_categories (user_id, category_id);

CREATE TABLE card_categories (
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id     uuid NOT NULL,
    category_id uuid NOT NULL,
    PRIMARY KEY (card_id, category_id),
    FOREIGN KEY (user_id, card_id)     REFERENCES cards (user_id, id)      ON DELETE CASCADE,
    FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id) ON DELETE NO ACTION
);
CREATE INDEX card_categories_category_idx ON card_categories (user_id, category_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Restores the shape of 00003, not its contents. Cards, schedules, review logs
-- and exam question sets come back empty — the uuid identifiers this migration
-- introduced have no `c:xxxx` equivalent to be translated into, which is the
-- same wall the Up side hit going the other way.

DROP TABLE IF EXISTS card_categories;
DROP TABLE IF EXISTS note_categories;
DROP TABLE IF EXISTS categories;

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_user_id_id_key;

DROP TABLE IF EXISTS exam_attempt_cards;
DROP TABLE IF EXISTS exam_cards;
DROP TABLE IF EXISTS card_schedules;
DROP TABLE IF EXISTS cards;

DELETE FROM exam_attempts;

DELETE FROM review_logs;
DROP INDEX IF EXISTS review_logs_card_idx;
DROP INDEX IF EXISTS review_logs_one_answer_per_attempt_idx;
ALTER TABLE review_logs DROP COLUMN card_id;
ALTER TABLE review_logs
    ADD COLUMN note_id uuid NOT NULL,
    ADD COLUMN card_id text NOT NULL;
CREATE INDEX review_logs_card_idx ON review_logs (note_id, card_id);
CREATE UNIQUE INDEX review_logs_one_answer_per_attempt_idx
    ON review_logs (exam_attempt_id, note_id, card_id)
    WHERE exam_attempt_id IS NOT NULL;

CREATE TABLE cards (
    id         text NOT NULL,
    note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       text NOT NULL CHECK (type IN ('basic', 'cloze', 'feynman')),
    front      text NOT NULL,
    back       text NOT NULL DEFAULT '',
    line       int  NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (note_id, id),
    CONSTRAINT cards_user_note_id_key UNIQUE (user_id, note_id, id)
);
CREATE INDEX cards_user_id_idx ON cards (user_id);
CREATE INDEX cards_note_id_idx ON cards (note_id);

CREATE TABLE card_schedules (
    note_id          uuid NOT NULL,
    card_id          text NOT NULL,
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage            int  NOT NULL DEFAULT 0,
    next_review_date date,
    lapses           int  NOT NULL DEFAULT 0,
    state            text NOT NULL DEFAULT 'learning'
                          CHECK (state IN ('learning', 'mastered')),
    PRIMARY KEY (note_id, card_id),
    FOREIGN KEY (note_id, card_id) REFERENCES cards(note_id, id) ON DELETE CASCADE
);
CREATE INDEX card_schedules_due_idx
    ON card_schedules (user_id, next_review_date)
    WHERE state = 'learning';

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

-- +goose StatementEnd
