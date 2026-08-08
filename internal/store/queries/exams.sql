-- Exams are practice tests over the cards that already exist in notes (D-048).
-- There is no question bank: a second place for knowledge to live is exactly
-- what D-005 collapsed.
--
-- Every query carries user_id, and the composite foreign keys make a
-- cross-tenant reference impossible even if one is forgotten (D-047).

-- name: ListExams :many
SELECT e.*,
       (SELECT count(*) FROM exam_attempts a
         WHERE a.exam_id = e.id AND a.finished_at IS NOT NULL) AS attempt_count
FROM exams e
WHERE e.user_id = $1 AND e.archived_at IS NULL
ORDER BY e.created_at DESC;

-- name: GetExam :one
SELECT * FROM exams
WHERE id = $1 AND user_id = $2;

-- name: CreateExam :one
INSERT INTO exams (user_id, domain_id, title, description, selection,
                   question_count, time_limit_minutes)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateExam :one
UPDATE exams
SET domain_id          = $3,
    title              = $4,
    description        = $5,
    selection          = $6,
    question_count     = $7,
    time_limit_minutes = $8,
    updated_at         = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: ArchiveExam :one
-- The normal way to retire an exam. Deleting one that has attempts would
-- destroy its score history while the individual answers survive in
-- review_logs, which is the worst of both (D-051).
UPDATE exams
SET archived_at = now(), updated_at = now()
WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
RETURNING *;

-- name: DeleteExam :execrows
-- Only succeeds when nothing references it: exam_attempts is ON DELETE NO
-- ACTION, so an exam that has ever been sat raises foreign_key_violation and
-- the handler answers 409.
DELETE FROM exams
WHERE id = $1 AND user_id = $2;

-- The pinned question set, selection = 'fixed' only.

-- name: ListExamCards :many
SELECT ec.card_id, ec.position, c.front
FROM exam_cards ec
JOIN cards c ON c.user_id = ec.user_id AND c.id = ec.card_id
WHERE ec.exam_id = $1 AND ec.user_id = $2 AND c.deleted_at IS NULL
ORDER BY ec.position;

-- name: ClearExamCards :exec
DELETE FROM exam_cards
WHERE exam_id = $1 AND user_id = $2;

-- name: AddExamCard :exec
INSERT INTO exam_cards (exam_id, user_id, card_id, position)
VALUES ($1, $2, $3, $4);

-- Attempts.

-- name: GetOpenAttempt :one
-- At most one can exist: a partial unique index enforces it.
SELECT * FROM exam_attempts
WHERE exam_id = $1 AND user_id = $2 AND finished_at IS NULL;

-- name: GetAttempt :one
SELECT * FROM exam_attempts
WHERE id = $1 AND user_id = $2;

-- name: CreateAttempt :one
-- attempt_date is the client's LOCAL YYYY-MM-DD, passed in rather than derived
-- from now(), for the same reason as focus_sessions.session_date: an attempt
-- at 23:00 belongs to that day and the server may be in another timezone.
INSERT INTO exam_attempts (exam_id, user_id, attempt_date)
VALUES ($1, $2, sqlc.arg(attempt_date)::date)
RETURNING *;

-- name: ListAttempts :many
SELECT * FROM exam_attempts
WHERE exam_id = $1 AND user_id = $2
ORDER BY started_at DESC
LIMIT $3;

-- name: FinishAttempt :one
-- The counts are recomputed here rather than accepted from the client. total
-- is how many questions the attempt drew, so an abandoned run scores against
-- everything it was asked, not only what it answered.
UPDATE exam_attempts a
SET finished_at   = now(),
    total_count   = (SELECT count(*) FROM exam_attempt_cards ac
                      WHERE ac.attempt_id = a.id),
    correct_count = (SELECT count(*) FROM review_logs rl
                      WHERE rl.exam_attempt_id = a.id AND rl.rating = 'ingat')
WHERE a.id = $1 AND a.user_id = $2 AND a.finished_at IS NULL
RETURNING *;

-- name: DeleteAttempt :execrows
-- Discards a run. The snapshot goes with it, but the answers stay in
-- review_logs with exam_attempt_id set to NULL — retention evidence is not
-- something a discarded practice run may erase (D-050).
DELETE FROM exam_attempts
WHERE id = $1 AND user_id = $2;

-- The draw, and the questions.

-- name: DrawRandomCards :many
-- Eligible cards for a random draw: live, this user's, and inside the exam's
-- domain when it has one. Mastered cards are included on purpose — an exam is
-- not a review session, and "do I still know this" is the whole point (D-048).
--
-- The domain now comes from the card itself. It used to come from the note the
-- card was parsed out of, which is exactly the join D-055 removed — and why
-- cards.domain_id had to exist before note_id could go.
SELECT c.id AS card_id
FROM cards c
WHERE c.user_id = $1
  AND c.deleted_at IS NULL
  AND (sqlc.narg(domain_id)::uuid IS NULL OR c.domain_id = sqlc.narg(domain_id))
ORDER BY random()
LIMIT $2;

-- name: SnapshotAttemptCard :exec
INSERT INTO exam_attempt_cards (attempt_id, user_id, card_id, position)
VALUES ($1, $2, $3, $4);

-- name: ListAttemptQuestions :many
-- The attempt's question set in presentation order, each with the answer
-- already given if there is one. This is what makes an attempt resumable: the
-- unanswered questions are the rows where rating is NULL (D-050).
--
-- The join to cards is LEFT: the snapshot deliberately has no foreign key to
-- cards so that deleting a note cannot erase a finished attempt's history. A
-- question whose card is gone still occupies its position in the score.
SELECT ac.position, ac.card_id,
       c.front, c.back, c.deleted_at,
       rl.rating
FROM exam_attempt_cards ac
LEFT JOIN cards c
       ON c.user_id = ac.user_id AND c.id = ac.card_id
LEFT JOIN review_logs rl
       ON rl.exam_attempt_id = ac.attempt_id
      AND rl.card_id = ac.card_id
WHERE ac.attempt_id = $1 AND ac.user_id = $2
ORDER BY ac.position;

-- name: AttemptHasQuestion :one
SELECT EXISTS (
    SELECT 1 FROM exam_attempt_cards
    WHERE attempt_id = $1 AND user_id = $2 AND card_id = $3
);

-- name: InsertExamAnswer :exec
-- An exam answer is a review that does not move the schedule (D-049), so
-- interval_before and interval_after are written equal — the ladder did not
-- advance. ON CONFLICT DO NOTHING against the partial unique index makes a
-- double-submitted rating idempotent instead of a corrupt score.
INSERT INTO review_logs (card_id, user_id, rating,
                         interval_before, interval_after,
                         source, exam_attempt_id)
VALUES ($1, $2, $3, sqlc.arg(interval_days), sqlc.arg(interval_days),
        'exam', $4)
ON CONFLICT (exam_attempt_id, card_id)
    WHERE exam_attempt_id IS NOT NULL
    DO NOTHING;
