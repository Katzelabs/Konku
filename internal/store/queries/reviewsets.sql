-- Review sets: a saved, repeatable configuration for a review over the cards
-- that already exist (D-048, renamed by D-075). There is no question bank — a
-- second place for knowledge to live is exactly what D-005 collapsed.
--
-- A `review_set` is the configuration; a `review_run` is one sitting of it.
-- The other path into a review is the scheduled due queue, which needs no
-- configuration and lives in cards.sql.
--
-- Every query carries user_id, and the composite foreign keys make a
-- cross-tenant reference impossible even if one is forgotten (D-047).

-- name: ListReviewSets :many
-- run_count counts finished runs only: an abandoned one is not a score, and a
-- list that counted it would tell the user they had sat something they had
-- not. The filter arrays are aggregated here rather than fetched per set,
-- which is the same shape ListCards uses for its categories.
--
-- `archived` switches the whole list to the archive, one query rather than two
-- so the aggregation cannot drift between them — same reason ListCards folds
-- the Terhapus view in rather than forking.
SELECT s.*,
       (SELECT count(*) FROM review_runs r
         WHERE r.set_id = s.id AND r.finished_at IS NOT NULL) AS run_count,
       COALESCE((SELECT array_agg(sd.domain_id ORDER BY sd.domain_id)
                   FROM review_set_domains sd WHERE sd.set_id = s.id),
                '{}')::uuid[] AS domain_ids,
       COALESCE((SELECT array_agg(sc.category_id ORDER BY sc.category_id)
                   FROM review_set_categories sc WHERE sc.set_id = s.id),
                '{}')::uuid[] AS category_ids,
       -- How many match before LIMIT, carried on every row — the same shape
       -- ListNotes and ListCards use (D-084). This list had no LIMIT at all
       -- before, so every subquery above ran once per set the account had ever
       -- made, on every load of the Ulangan screen.
       count(*) OVER () AS total
FROM review_sets s
WHERE s.user_id = $1
  AND CASE WHEN sqlc.arg(archived)::bool
           THEN s.archived_at IS NOT NULL
           ELSE s.archived_at IS NULL
      END
-- id breaks the tie. created_at is not unique, and a page boundary landing
-- inside a tie serves one row twice and skips another.
ORDER BY s.created_at DESC, s.id DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: GetReviewSet :one
SELECT s.*,
       (SELECT count(*) FROM review_runs r
         WHERE r.set_id = s.id AND r.finished_at IS NOT NULL) AS run_count,
       COALESCE((SELECT array_agg(sd.domain_id ORDER BY sd.domain_id)
                   FROM review_set_domains sd WHERE sd.set_id = s.id),
                '{}')::uuid[] AS domain_ids,
       COALESCE((SELECT array_agg(sc.category_id ORDER BY sc.category_id)
                   FROM review_set_categories sc WHERE sc.set_id = s.id),
                '{}')::uuid[] AS category_ids
FROM review_sets s
WHERE s.id = $1 AND s.user_id = $2;

-- name: CreateReviewSet :one
INSERT INTO review_sets (user_id, title, description, selection,
                         question_count, time_limit_minutes, format)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateReviewSet :one
UPDATE review_sets
SET title              = $3,
    description        = $4,
    selection          = $5,
    question_count     = $6,
    time_limit_minutes = $7,
    format             = $8,
    updated_at         = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: ArchiveReviewSet :one
-- The normal way to retire a set. Deleting one that has runs would destroy its
-- score history while the individual answers survive in review_logs, which is
-- the worst of both (D-051).
UPDATE review_sets
SET archived_at = now(), updated_at = now()
WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
RETURNING *;

-- name: UnarchiveReviewSet :one
-- Exams had no way back, unlike domains and categories. Archiving is meant to
-- be the safe alternative to deleting, and a safe alternative you cannot undo
-- is only half of one.
UPDATE review_sets
SET archived_at = NULL, updated_at = now()
WHERE id = $1 AND user_id = $2 AND archived_at IS NOT NULL
RETURNING *;

-- name: DeleteReviewSet :execrows
-- Only succeeds when nothing references it: review_runs is ON DELETE NO
-- ACTION, so a set that has ever been run raises foreign_key_violation and the
-- handler answers 409.
DELETE FROM review_sets
WHERE id = $1 AND user_id = $2;

-- The filters. Empty means unfiltered, which is what a NULL domain_id meant
-- before 00012 split one nullable column into two join tables.

-- name: ClearSetDomains :exec
DELETE FROM review_set_domains WHERE set_id = $1 AND user_id = $2;

-- name: AddSetDomain :exec
INSERT INTO review_set_domains (user_id, set_id, domain_id)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: ClearSetCategories :exec
DELETE FROM review_set_categories WHERE set_id = $1 AND user_id = $2;

-- name: AddSetCategory :exec
INSERT INTO review_set_categories (user_id, set_id, category_id)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- The pinned question set, selection = 'fixed' only.

-- name: ListSetCards :many
SELECT sc.card_id, sc.position, c.front
FROM review_set_cards sc
JOIN cards c ON c.user_id = sc.user_id AND c.id = sc.card_id
WHERE sc.set_id = $1 AND sc.user_id = $2 AND c.deleted_at IS NULL
ORDER BY sc.position;

-- name: ClearSetCards :exec
DELETE FROM review_set_cards
WHERE set_id = $1 AND user_id = $2;

-- name: AddSetCard :exec
INSERT INTO review_set_cards (set_id, user_id, card_id, position)
VALUES ($1, $2, $3, $4);

-- Runs.

-- name: GetOpenRun :one
-- At most one can exist: a partial unique index enforces it.
SELECT * FROM review_runs
WHERE set_id = $1 AND user_id = $2 AND finished_at IS NULL;

-- name: GetRun :one
SELECT * FROM review_runs
WHERE id = $1 AND user_id = $2;

-- name: CreateRun :one
-- run_date is the client's LOCAL YYYY-MM-DD, passed in rather than derived
-- from now(), for the same reason as focus_sessions.session_date: a run at
-- 23:00 belongs to that day and the server may be in another timezone.
INSERT INTO review_runs (set_id, user_id, run_date)
VALUES ($1, $2, sqlc.arg(run_date)::date)
RETURNING *;

-- name: ListRuns :many
-- The history of a set: finished sittings only, newest first, one page at a
-- time.
--
-- It used to return every run up to a hardcoded twenty with no OFFSET, so the
-- twenty-first sitting of a set existed, counted in run_count, appeared in the
-- export, and could not be reached by any request the API was able to express
-- — the same failure D-084 fixed for notes and cards.
--
-- Finished only, because the open run is not history: it is the thing the
-- Mulai button resumes, and the detail response carries it separately through
-- GetOpenRun. Folding it into a paged list would make "is there one open"
-- depend on which page you happened to be looking at. It also makes `total`
-- here exactly the run_count the set carries, which counts finished runs for
-- the same reason.
SELECT sqlc.embed(r), count(*) OVER () AS total
FROM review_runs r
WHERE r.set_id = $1 AND r.user_id = $2 AND r.finished_at IS NOT NULL
-- id breaks the tie, as in every other paged list.
ORDER BY r.started_at DESC, r.id DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: FinishRun :one
-- The counts are recomputed here rather than accepted from the client. total
-- is how many questions the run drew, so an abandoned one scores against
-- everything it was asked, not only what it answered.
UPDATE review_runs r
SET finished_at   = now(),
    total_count   = (SELECT count(*) FROM review_run_cards rc
                      WHERE rc.run_id = r.id),
    correct_count = (SELECT count(*) FROM review_logs rl
                      WHERE rl.run_id = r.id AND rl.rating = 'ingat')
WHERE r.id = $1 AND r.user_id = $2 AND r.finished_at IS NULL
RETURNING *;

-- name: DeleteRun :execrows
-- Discards a run. The snapshot goes with it, but the answers stay in
-- review_logs with run_id set to NULL — retention evidence is not something a
-- discarded practice run may erase (D-050).
DELETE FROM review_runs
WHERE id = $1 AND user_id = $2;

-- The draw, and the questions.

-- name: DrawRandomCards :many
-- Eligible cards for a random draw: live, this user's, and inside the set's
-- filters. Mastered cards are included on purpose — "do I still know this" is
-- the whole point, and a set is not the scheduled queue (D-048).
--
-- An empty array means the filter is off, which is how a set with no domains
-- and no categories draws from the whole knowledge base. Domains are OR'd
-- against each other and so are categories, but the two groups are AND'ed:
-- picking Matematika and the "rumus" category means cards that are both.
SELECT c.id AS card_id
FROM cards c
WHERE c.user_id = $1
  AND c.deleted_at IS NULL
  -- coalesce, not a bare cardinality(): pgx encodes a nil Go slice as SQL
  -- NULL rather than '{}', and cardinality(NULL) is NULL, which makes the
  -- whole OR null and drops every row. "No filter" would then silently mean
  -- "match nothing" for any caller that passed nil instead of an empty slice.
  AND (coalesce(cardinality(sqlc.arg(domain_ids)::uuid[]), 0) = 0
       OR c.domain_id = ANY(sqlc.arg(domain_ids)::uuid[]))
  AND (coalesce(cardinality(sqlc.arg(category_ids)::uuid[]), 0) = 0
       OR EXISTS (SELECT 1 FROM card_categories cc
                   WHERE cc.card_id = c.id
                     AND cc.category_id = ANY(sqlc.arg(category_ids)::uuid[])))
ORDER BY random()
LIMIT sqlc.arg(want);

-- name: ListDistractorPool :many
-- Candidate wrong answers, taken from the backs of the user's other cards
-- (D-077). Nothing is authored for this: making the user write three plausible
-- wrong answers per card would tax capture, which is the one cost this product
-- protects above all (hard rule 7).
--
-- One pool for the whole run rather than three fresh draws per question. A
-- run of 50 questions would otherwise be 50 extra round trips inside the
-- transaction that starts it, and the pool answers the same need: which of
-- this user's answers are plausible next to each other. Distractors repeating
-- across questions in one run is ordinary for a quiz, not a defect.
--
-- Empty backs are excluded because an empty option is not a choice. The
-- correct answer is *not* excluded here — it cannot be, one pool serves every
-- question — so the caller drops it per question before sampling.
--
-- DISTINCT sits in a subquery because ORDER BY random() is not allowed
-- alongside SELECT DISTINCT: the sort expression has to appear in the select
-- list, and adding it there would defeat the DISTINCT.
SELECT back FROM (
    SELECT DISTINCT c.back
    FROM cards c
    WHERE c.user_id = $1
      AND c.deleted_at IS NULL
      AND c.back <> ''
      -- coalesce for the same reason as DrawRandomCards, and it matters more
      -- here: the widening pass deliberately calls this with no filters at
      -- all, so nil is the normal input rather than an edge case.
      AND (coalesce(cardinality(sqlc.arg(domain_ids)::uuid[]), 0) = 0
           OR c.domain_id = ANY(sqlc.arg(domain_ids)::uuid[]))
      AND (coalesce(cardinality(sqlc.arg(category_ids)::uuid[]), 0) = 0
           OR EXISTS (SELECT 1 FROM card_categories cc
                       WHERE cc.card_id = c.id
                         AND cc.category_id = ANY(sqlc.arg(category_ids)::uuid[])))
) d
ORDER BY random()
LIMIT sqlc.arg(want);

-- name: ListCardBacks :many
-- The answers for the drawn question set, to seed the correct option of each
-- multiple-choice question. Soft-deleted cards are excluded: a card deleted
-- between the draw and the snapshot has no answer to be right about, and that
-- question falls back to recall.
SELECT id, back FROM cards
WHERE user_id = $1 AND id = ANY(sqlc.arg(card_ids)::uuid[])
  AND deleted_at IS NULL;

-- name: SnapshotRunCard :exec
-- options and correct_index are NULL for a recall question, and for a choice
-- question that could not find enough distractors to build from.
INSERT INTO review_run_cards (run_id, user_id, card_id, position,
                              options, correct_index)
VALUES ($1, $2, $3, $4, sqlc.narg(options)::text[], sqlc.narg(correct_index));

-- name: ListRunQuestions :many
-- The run's question set in presentation order, each with the answer already
-- given if there is one. This is what makes a run resumable: the unanswered
-- questions are the rows where rating is NULL (D-050).
--
-- `back` is not selected and `correct_index` is not selected. The first is
-- recall before reveal held at the SQL layer, the same way ListDueCards holds
-- it (D-003); the second is what keeps a multiple-choice question from
-- shipping its own answer key. Both are read one row at a time by
-- GetRunQuestion, on the request that grades or reveals.
--
-- The join to cards is LEFT: the snapshot deliberately has no foreign key to
-- cards so that deleting one cannot erase a finished run's history. A question
-- whose card is gone still occupies its position in the score.
SELECT rc.position, rc.card_id, rc.options,
       c.front, c.deleted_at,
       rl.rating
FROM review_run_cards rc
LEFT JOIN cards c
       ON c.user_id = rc.user_id AND c.id = rc.card_id
LEFT JOIN review_logs rl
       ON rl.run_id = rc.run_id
      AND rl.card_id = rc.card_id
WHERE rc.run_id = $1 AND rc.user_id = $2
ORDER BY rc.position;

-- name: GetRunQuestion :one
-- One question, with everything the server needs to grade or reveal it. No
-- rows means the card is not part of this run, which the handler answers 404 —
-- it also replaces the old AttemptHasQuestion existence check, so the grading
-- path reads one row instead of the whole question list.
SELECT rc.position, rc.card_id, rc.options, rc.correct_index,
       c.front, c.back, c.deleted_at
FROM review_run_cards rc
LEFT JOIN cards c
       ON c.user_id = rc.user_id AND c.id = rc.card_id
WHERE rc.run_id = $1 AND rc.user_id = $2 AND rc.card_id = $3;

-- name: InsertSetAnswer :exec
-- An answer given inside a set is a review that does not move the schedule
-- (D-049), so interval_before and interval_after are written equal — the
-- ladder did not advance. `format` records whether the user recalled it or
-- recognised it among options, so the retention metric can tell the two apart
-- (D-077). ON CONFLICT DO NOTHING against the partial unique index makes a
-- double-submitted answer idempotent instead of a corrupt score.
INSERT INTO review_logs (card_id, user_id, rating,
                         interval_before, interval_after,
                         source, run_id, format)
VALUES ($1, $2, $3, sqlc.arg(interval_days), sqlc.arg(interval_days),
        'set', $4, sqlc.arg(format))
ON CONFLICT (run_id, card_id)
    WHERE run_id IS NOT NULL
    DO NOTHING;
