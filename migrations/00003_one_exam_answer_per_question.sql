-- +goose Up
-- +goose StatementBegin

-- An exam answer is a review_logs row (D-049), and nothing stopped the same
-- question being answered twice in one attempt. A double-clicked rating would
-- write two rows, and FinishAttempt counts rows — so the score would read
-- 11/10 and the retention metric would double-count that card.
--
-- Partial, because ordinary reviews are supposed to repeat: the same card is
-- rated again every time it comes due. The constraint applies only to rows
-- that belong to an attempt.
CREATE UNIQUE INDEX review_logs_one_answer_per_attempt_idx
    ON review_logs (exam_attempt_id, note_id, card_id)
    WHERE exam_attempt_id IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS review_logs_one_answer_per_attempt_idx;
-- +goose StatementEnd
