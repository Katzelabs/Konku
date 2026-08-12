-- +goose Up
-- +goose StatementBegin

-- ---------------------------------------------------------------------------
-- Ulangan absorbs Ujian (D-075).
--
-- These were always one feature. Both ask a card, both take ingat/lupa, and
-- both already write the same table — `review_logs.source` has distinguished
-- them since 00002. What separated them was build order, not product: the due
-- queue shipped in 03 and exams in 00002, each with its own screen, its own
-- nav entry and its own vocabulary for the same act.
--
-- This migration is a rename plus three additions. Nothing here changes what
-- a review *is*; it changes what it is called and what you can configure
-- before starting one.
--
-- Why not `review_sessions`: `auth_sessions` and `focus_sessions` already
-- exist, and D-052 renamed a table specifically to end the "which sessions
-- table" ambiguity. A third one would undo that for nothing. A saved
-- configuration is a `review_set`; one sitting of it is a `review_run`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. exams -> review_sets
--
-- Renames only. Grants follow the table OID and survive; RLS policies do not
-- rename themselves, so each is renamed explicitly below in §5 — a policy
-- called `exams_tenant` sitting on `review_sets` still works, and is exactly
-- the kind of stale name that makes the next reader doubt whether it applies.
-- ---------------------------------------------------------------------------
ALTER TABLE exams RENAME TO review_sets;

ALTER INDEX exams_pkey           RENAME TO review_sets_pkey;
ALTER INDEX exams_user_id_id_key RENAME TO review_sets_user_id_id_key;
ALTER INDEX exams_user_idx       RENAME TO review_sets_user_idx;

ALTER TABLE review_sets RENAME CONSTRAINT exams_user_id_fkey
    TO review_sets_user_id_fkey;
ALTER TABLE review_sets RENAME CONSTRAINT exams_selection_check
    TO review_sets_selection_check;
ALTER TABLE review_sets RENAME CONSTRAINT exams_question_count_check
    TO review_sets_question_count_check;
ALTER TABLE review_sets RENAME CONSTRAINT exams_time_limit_minutes_check
    TO review_sets_time_limit_minutes_check;
-- The unnamed one: (selection = 'random') = (question_count IS NOT NULL).
ALTER TABLE review_sets RENAME CONSTRAINT exams_check
    TO review_sets_selection_count_chk;

-- ---------------------------------------------------------------------------
-- 2. exam_cards -> review_set_cards, exam_attempts -> review_runs,
--    exam_attempt_cards -> review_run_cards.
--
-- The owning column is renamed too (exam_id -> set_id, attempt_id -> run_id).
-- Renaming a column rewrites every dependent index predicate, check
-- expression and foreign key by attnum, so nothing below has to be rebuilt
-- for the column's sake — only the constraint *names* need saying out loud.
-- ---------------------------------------------------------------------------
ALTER TABLE exam_cards RENAME TO review_set_cards;
ALTER TABLE review_set_cards RENAME COLUMN exam_id TO set_id;

ALTER INDEX exam_cards_pkey     RENAME TO review_set_cards_pkey;
ALTER INDEX exam_cards_user_idx RENAME TO review_set_cards_user_idx;

ALTER TABLE review_set_cards RENAME CONSTRAINT exam_cards_user_id_fkey
    TO review_set_cards_user_id_fkey;
ALTER TABLE review_set_cards RENAME CONSTRAINT exam_cards_user_id_exam_id_fkey
    TO review_set_cards_user_id_set_id_fkey;
ALTER TABLE review_set_cards RENAME CONSTRAINT exam_cards_user_id_card_id_fkey
    TO review_set_cards_user_id_card_id_fkey;

ALTER TABLE exam_attempts RENAME TO review_runs;
ALTER TABLE review_runs RENAME COLUMN exam_id      TO set_id;
ALTER TABLE review_runs RENAME COLUMN attempt_date TO run_date;

ALTER INDEX exam_attempts_pkey           RENAME TO review_runs_pkey;
ALTER INDEX exam_attempts_user_id_id_key RENAME TO review_runs_user_id_id_key;
ALTER INDEX exam_attempts_user_idx       RENAME TO review_runs_user_idx;
ALTER INDEX exam_attempts_exam_idx       RENAME TO review_runs_set_idx;
ALTER INDEX exam_attempts_one_open_idx   RENAME TO review_runs_one_open_idx;

ALTER TABLE review_runs RENAME CONSTRAINT exam_attempts_user_id_fkey
    TO review_runs_user_id_fkey;
ALTER TABLE review_runs RENAME CONSTRAINT exam_attempts_user_id_exam_id_fkey
    TO review_runs_user_id_set_id_fkey;
-- correct_count BETWEEN 0 AND total_count, and finished_at >= started_at.
ALTER TABLE review_runs RENAME CONSTRAINT exam_attempts_check
    TO review_runs_count_chk;
ALTER TABLE review_runs RENAME CONSTRAINT exam_attempts_check1
    TO review_runs_finished_chk;

ALTER TABLE exam_attempt_cards RENAME TO review_run_cards;
ALTER TABLE review_run_cards RENAME COLUMN attempt_id TO run_id;

ALTER INDEX exam_attempt_cards_pkey     RENAME TO review_run_cards_pkey;
ALTER INDEX exam_attempt_cards_user_idx RENAME TO review_run_cards_user_idx;
ALTER INDEX exam_attempt_cards_attempt_id_position_key
    RENAME TO review_run_cards_run_id_position_key;

ALTER TABLE review_run_cards RENAME CONSTRAINT exam_attempt_cards_user_id_fkey
    TO review_run_cards_user_id_fkey;
ALTER TABLE review_run_cards
    RENAME CONSTRAINT exam_attempt_cards_user_id_attempt_id_fkey
    TO review_run_cards_user_id_run_id_fkey;

-- ---------------------------------------------------------------------------
-- 3. review_logs: the column, and the vocabulary.
--
-- `source` used to read 'review' | 'exam' — a distinction that only made
-- sense while one of the two was not called review. Both are reviews now, so
-- the values name the two *paths*: 'due' is the scheduled queue, 'set' is a
-- saved practice set. The lens D-049 wanted is unchanged; only the words are.
--
-- Both CHECKs have to be dropped before the UPDATE rather than renamed:
-- a check expression cannot be altered in place, and the old one forbids
-- exactly the values this is migrating to.
-- ---------------------------------------------------------------------------
ALTER TABLE review_logs RENAME COLUMN exam_attempt_id TO run_id;

ALTER INDEX review_logs_attempt_idx RENAME TO review_logs_run_idx;
ALTER INDEX review_logs_one_answer_per_attempt_idx
    RENAME TO review_logs_one_answer_per_run_idx;

ALTER TABLE review_logs RENAME CONSTRAINT review_logs_attempt_fkey
    TO review_logs_run_fkey;

ALTER TABLE review_logs
    DROP CONSTRAINT review_logs_source_check,
    DROP CONSTRAINT review_logs_exam_source_chk;

UPDATE review_logs
   SET source = CASE WHEN source = 'exam' THEN 'set' ELSE 'due' END;

ALTER TABLE review_logs
    ALTER COLUMN source SET DEFAULT 'due',
    ADD CONSTRAINT review_logs_source_check
        CHECK (source IN ('due', 'set')),
    ADD CONSTRAINT review_logs_run_source_chk
        CHECK (run_id IS NULL OR source = 'set');

-- Which format the answer was given in, so the retention metric can tell
-- recall from recognition (D-077).
--
-- This lives on the log row and not on review_sets, which would otherwise be
-- one join away. `run_id` is ON DELETE SET NULL — discarding a run must not
-- destroy retention evidence, and it must not silently reclassify it either.
-- A choice answer whose run was discarded has to still read as a choice
-- answer, or D-004's headline number quietly absorbs 1-in-4 guesses with no
-- way to separate them again (D-029: this cannot be reconstructed later).
ALTER TABLE review_logs
    ADD COLUMN format text NOT NULL DEFAULT 'recall'
        CHECK (format IN ('recall', 'choice'));

-- ---------------------------------------------------------------------------
-- 4. A set filters by many domains and many categories, not one domain.
--
-- `exams.domain_id` was a single nullable uuid: one domain, or the whole
-- knowledge base. Categories could not narrow a draw at all, which made the
-- organising axis the user actually uses day to day invisible to the one
-- feature that most needed it.
--
-- Empty means unfiltered, which is what NULL domain_id meant before, so the
-- backfill only has to carry the rows that had a domain.
--
-- Both tables carry user_id and point at UNIQUE (user_id, id) for the same
-- reason every other reference does (D-047): without it an unvalidated id in
-- a request body attaches one user's set to another user's domain, satisfying
-- the FK while the WHERE clause never sees it.
-- ---------------------------------------------------------------------------
CREATE TABLE review_set_domains (
    user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    set_id    uuid NOT NULL,
    domain_id uuid NOT NULL,
    PRIMARY KEY (set_id, domain_id),
    FOREIGN KEY (user_id, set_id)
        REFERENCES review_sets (user_id, id) ON DELETE CASCADE,
    -- NO ACTION, like every other reference to domains: a domain in use is
    -- archived, never deleted (D-051).
    FOREIGN KEY (user_id, domain_id)
        REFERENCES domains (user_id, id) ON DELETE NO ACTION
);
CREATE INDEX review_set_domains_domain_idx
    ON review_set_domains (user_id, domain_id);

CREATE TABLE review_set_categories (
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    set_id      uuid NOT NULL,
    category_id uuid NOT NULL,
    PRIMARY KEY (set_id, category_id),
    FOREIGN KEY (user_id, set_id)
        REFERENCES review_sets (user_id, id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, category_id)
        REFERENCES categories (user_id, id) ON DELETE NO ACTION
);
CREATE INDEX review_set_categories_category_idx
    ON review_set_categories (user_id, category_id);

INSERT INTO review_set_domains (user_id, set_id, domain_id)
SELECT user_id, id, domain_id FROM review_sets WHERE domain_id IS NOT NULL;

DROP INDEX exams_domain_idx;
ALTER TABLE review_sets DROP COLUMN domain_id;

-- ---------------------------------------------------------------------------
-- 5. How the questions are asked, and the option snapshot.
--
-- `format` is a property of the set, deliberately not of the card (D-076).
-- cards.type exists and admits 'cloze' and 'feynman', and both stay deferred
-- (D-031, restated by D-055 precisely because standalone card CRUD makes a
-- type picker easy). Asking the same card as free recall today and as
-- multiple choice tomorrow is the point; that is a property of the asking.
-- ---------------------------------------------------------------------------
ALTER TABLE review_sets
    ADD COLUMN format text NOT NULL DEFAULT 'recall'
        CHECK (format IN ('recall', 'choice'));

-- The options as they were when the run started, in presentation order.
--
-- Same reasoning as the draw itself (D-050): options that were computed only
-- in memory would reshuffle when a half-finished run is resumed, and the
-- second half of the run would be answering a different question from the
-- first.
--
-- Text, not card ids. review_run_cards has no foreign key to cards on
-- purpose, so a distractor whose card is later hard-deleted would leave a
-- blank option in a finished run's history. Storing what was actually shown
-- makes the snapshot self-contained, which is what every other history table
-- here already is.
--
-- NULL options means "ask this one as plain recall" — both for a 'recall' set
-- and for the per-question fallback when there were not enough other cards to
-- build a choice from.
ALTER TABLE review_run_cards
    ADD COLUMN options       text[],
    ADD COLUMN correct_index int,
    ADD CONSTRAINT review_run_cards_options_chk CHECK (
        (options IS NULL AND correct_index IS NULL)
        OR (options IS NOT NULL
            AND correct_index IS NOT NULL
            AND array_length(options, 1) >= 2
            AND correct_index >= 0
            AND correct_index < array_length(options, 1))
    );

-- ---------------------------------------------------------------------------
-- 6. RLS: rename the four policies, and cover the two new tables.
--
-- The `owned[]` array in 00006 is that migration's historical record and is
-- not edited; a table added later brings its own policy, as this one does.
-- ENABLE without FORCE leaves the policy inert for the table owner, which is
-- the failure mode D-059 exists to catch, so both are always said together.
-- ---------------------------------------------------------------------------
ALTER POLICY exams_tenant              ON review_sets      RENAME TO review_sets_tenant;
ALTER POLICY exam_cards_tenant         ON review_set_cards RENAME TO review_set_cards_tenant;
ALTER POLICY exam_attempts_tenant      ON review_runs      RENAME TO review_runs_tenant;
ALTER POLICY exam_attempt_cards_tenant ON review_run_cards RENAME TO review_run_cards_tenant;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    review_set_domains,
    review_set_categories
TO konku_app;

-- +goose StatementEnd

-- +goose StatementBegin
DO $$
DECLARE
    t text;
    owned text[] := ARRAY['review_set_domains', 'review_set_categories'];
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

-- +goose Down
-- +goose StatementBegin

-- Lossy in one place: a set that filters on more than one domain collapses
-- back to a single domain_id, and every category filter is discarded — the
-- old schema has nowhere to put either. Which domain survives is the
-- lexicographically smallest, chosen only because it is deterministic.
--
-- The question format and every option snapshot are dropped outright. A
-- finished choice run keeps its score and its answers, because those live in
-- review_runs and review_logs; what it loses is the record of which four
-- options were on screen.

DROP POLICY IF EXISTS review_set_categories_tenant ON review_set_categories;
DROP POLICY IF EXISTS review_set_domains_tenant    ON review_set_domains;

ALTER TABLE review_run_cards
    DROP CONSTRAINT review_run_cards_options_chk,
    DROP COLUMN correct_index,
    DROP COLUMN options;

ALTER TABLE review_sets DROP COLUMN format;

ALTER TABLE review_sets ADD COLUMN domain_id uuid;
-- ORDER BY ... LIMIT 1 rather than min(): there is no min(uuid) aggregate.
UPDATE review_sets s
   SET domain_id = (SELECT d.domain_id FROM review_set_domains d
                     WHERE d.set_id = s.id
                     ORDER BY d.domain_id::text LIMIT 1);
ALTER TABLE review_sets
    ADD CONSTRAINT exams_user_id_domain_id_fkey
    FOREIGN KEY (user_id, domain_id) REFERENCES domains (user_id, id)
    ON DELETE NO ACTION;

DROP TABLE review_set_categories;
DROP TABLE review_set_domains;

ALTER TABLE review_logs DROP COLUMN format;

ALTER TABLE review_logs
    DROP CONSTRAINT review_logs_source_check,
    DROP CONSTRAINT review_logs_run_source_chk;

UPDATE review_logs
   SET source = CASE WHEN source = 'set' THEN 'exam' ELSE 'review' END;

ALTER TABLE review_logs
    ALTER COLUMN source SET DEFAULT 'review',
    ADD CONSTRAINT review_logs_source_check
        CHECK (source IN ('review', 'exam')),
    ADD CONSTRAINT review_logs_exam_source_chk
        CHECK (run_id IS NULL OR source = 'exam');

ALTER TABLE review_logs RENAME CONSTRAINT review_logs_run_fkey
    TO review_logs_attempt_fkey;
ALTER INDEX review_logs_one_answer_per_run_idx
    RENAME TO review_logs_one_answer_per_attempt_idx;
ALTER INDEX review_logs_run_idx RENAME TO review_logs_attempt_idx;
ALTER TABLE review_logs RENAME COLUMN run_id TO exam_attempt_id;

ALTER POLICY review_run_cards_tenant ON review_run_cards RENAME TO exam_attempt_cards_tenant;
ALTER POLICY review_runs_tenant      ON review_runs      RENAME TO exam_attempts_tenant;
ALTER POLICY review_set_cards_tenant ON review_set_cards RENAME TO exam_cards_tenant;
ALTER POLICY review_sets_tenant      ON review_sets      RENAME TO exams_tenant;

ALTER TABLE review_run_cards
    RENAME CONSTRAINT review_run_cards_user_id_run_id_fkey
    TO exam_attempt_cards_user_id_attempt_id_fkey;
ALTER TABLE review_run_cards RENAME CONSTRAINT review_run_cards_user_id_fkey
    TO exam_attempt_cards_user_id_fkey;
ALTER INDEX review_run_cards_run_id_position_key
    RENAME TO exam_attempt_cards_attempt_id_position_key;
ALTER INDEX review_run_cards_user_idx RENAME TO exam_attempt_cards_user_idx;
ALTER INDEX review_run_cards_pkey     RENAME TO exam_attempt_cards_pkey;
ALTER TABLE review_run_cards RENAME COLUMN run_id TO attempt_id;
ALTER TABLE review_run_cards RENAME TO exam_attempt_cards;

ALTER TABLE review_runs RENAME CONSTRAINT review_runs_finished_chk
    TO exam_attempts_check1;
ALTER TABLE review_runs RENAME CONSTRAINT review_runs_count_chk
    TO exam_attempts_check;
ALTER TABLE review_runs RENAME CONSTRAINT review_runs_user_id_set_id_fkey
    TO exam_attempts_user_id_exam_id_fkey;
ALTER TABLE review_runs RENAME CONSTRAINT review_runs_user_id_fkey
    TO exam_attempts_user_id_fkey;
ALTER INDEX review_runs_one_open_idx   RENAME TO exam_attempts_one_open_idx;
ALTER INDEX review_runs_set_idx        RENAME TO exam_attempts_exam_idx;
ALTER INDEX review_runs_user_idx       RENAME TO exam_attempts_user_idx;
ALTER INDEX review_runs_user_id_id_key RENAME TO exam_attempts_user_id_id_key;
ALTER INDEX review_runs_pkey           RENAME TO exam_attempts_pkey;
ALTER TABLE review_runs RENAME COLUMN run_date TO attempt_date;
ALTER TABLE review_runs RENAME COLUMN set_id   TO exam_id;
ALTER TABLE review_runs RENAME TO exam_attempts;

ALTER TABLE review_set_cards RENAME CONSTRAINT review_set_cards_user_id_card_id_fkey
    TO exam_cards_user_id_card_id_fkey;
ALTER TABLE review_set_cards RENAME CONSTRAINT review_set_cards_user_id_set_id_fkey
    TO exam_cards_user_id_exam_id_fkey;
ALTER TABLE review_set_cards RENAME CONSTRAINT review_set_cards_user_id_fkey
    TO exam_cards_user_id_fkey;
ALTER INDEX review_set_cards_user_idx RENAME TO exam_cards_user_idx;
ALTER INDEX review_set_cards_pkey     RENAME TO exam_cards_pkey;
ALTER TABLE review_set_cards RENAME COLUMN set_id TO exam_id;
ALTER TABLE review_set_cards RENAME TO exam_cards;

ALTER TABLE review_sets RENAME CONSTRAINT review_sets_selection_count_chk
    TO exams_check;
ALTER TABLE review_sets RENAME CONSTRAINT review_sets_time_limit_minutes_check
    TO exams_time_limit_minutes_check;
ALTER TABLE review_sets RENAME CONSTRAINT review_sets_question_count_check
    TO exams_question_count_check;
ALTER TABLE review_sets RENAME CONSTRAINT review_sets_selection_check
    TO exams_selection_check;
ALTER TABLE review_sets RENAME CONSTRAINT review_sets_user_id_fkey
    TO exams_user_id_fkey;
ALTER INDEX review_sets_user_idx       RENAME TO exams_user_idx;
ALTER INDEX review_sets_user_id_id_key RENAME TO exams_user_id_id_key;
ALTER INDEX review_sets_pkey           RENAME TO exams_pkey;
ALTER TABLE review_sets RENAME TO exams;

CREATE INDEX exams_domain_idx ON exams (user_id, domain_id);

-- +goose StatementEnd
