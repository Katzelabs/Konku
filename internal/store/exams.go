package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// ErrExamNotFound covers a missing exam, an archived one, and one owned by
// somebody else. They are deliberately indistinguishable (D-039).
var ErrExamNotFound = errors.New("store: exam not found")

// ErrExamHasNoCards is a real, reachable state, not a corruption: a brand new
// account has notes but no cards yet, and an exam scoped to a domain whose
// notes carry no `::` lines has nothing to ask.
var ErrExamHasNoCards = errors.New("store: exam has no cards to draw from")

// StartedAttempt is the result of starting or resuming an exam.
type StartedAttempt struct {
	Attempt gen.ExamAttempt
	// Resumed reports that an unfinished attempt already existed and was
	// returned instead of a new one.
	Resumed bool
}

// StartAttempt begins a sitting of an exam, or hands back the one already in
// progress.
//
// The attempt row and its question snapshot commit together. Without the
// snapshot a random draw would exist only in memory, so closing the tab
// halfway would lose every unanswered question and resuming would silently
// re-draw a different exam (D-050).
//
// Starting is idempotent on purpose. An exam has at most one open attempt — a
// partial unique index enforces it — so a second "start" is what a user
// pressing the button again after a refresh means, and it should return them
// to where they were rather than fail.
func (s *Store) StartAttempt(
	ctx context.Context,
	userID, examID uuid.UUID,
	attemptDate time.Time,
) (StartedAttempt, error) {
	var out StartedAttempt

	err := s.WithTx(ctx, func(q *gen.Queries) error {
		exam, err := q.GetExam(ctx, gen.GetExamParams{ID: examID, UserID: userID})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrExamNotFound
		}
		if err != nil {
			return fmt.Errorf("store: reading exam: %w", err)
		}
		if exam.ArchivedAt != nil {
			return ErrExamNotFound
		}

		open, err := q.GetOpenAttempt(ctx, gen.GetOpenAttemptParams{
			ExamID: examID, UserID: userID,
		})
		if err == nil {
			out = StartedAttempt{Attempt: open, Resumed: true}
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("store: reading open attempt: %w", err)
		}

		questions, err := drawQuestions(ctx, q, userID, exam)
		if err != nil {
			return err
		}
		if len(questions) == 0 {
			return ErrExamHasNoCards
		}

		attempt, err := q.CreateAttempt(ctx, gen.CreateAttemptParams{
			ExamID:      examID,
			UserID:      userID,
			AttemptDate: attemptDate,
		})
		if err != nil {
			return fmt.Errorf("store: creating attempt: %w", err)
		}

		for i, cardID := range questions {
			if err := q.SnapshotAttemptCard(ctx, gen.SnapshotAttemptCardParams{
				AttemptID: attempt.ID,
				UserID:    userID,
				CardID:    cardID,
				Position:  int32(i + 1),
			}); err != nil {
				return fmt.Errorf("store: snapshotting question %d: %w", i+1, err)
			}
		}

		out = StartedAttempt{Attempt: attempt}
		return nil
	})
	if err != nil {
		return StartedAttempt{}, err
	}
	return out, nil
}

// drawQuestions picks the card set for one sitting, in presentation order.
//
// 'fixed' reads the pinned set, so two attempts at the same exam compare like
// for like. 'random' draws afresh, which is better practice and makes scores
// non-comparable — the trade-off is the user's to make per exam (D-048).
func drawQuestions(ctx context.Context, q *gen.Queries, userID uuid.UUID, exam gen.Exam) ([]uuid.UUID, error) {
	if exam.Selection == "fixed" {
		rows, err := q.ListExamCards(ctx, gen.ListExamCardsParams{
			ExamID: exam.ID, UserID: userID,
		})
		if err != nil {
			return nil, fmt.Errorf("store: reading pinned cards: %w", err)
		}
		out := make([]uuid.UUID, 0, len(rows))
		for _, row := range rows {
			out = append(out, row.CardID)
		}
		return out, nil
	}

	// A 'random' exam always carries a question_count — a CHECK constraint
	// ties the two together — so the nil case cannot happen through the API.
	// Guarding anyway, because a nil deref here would be a 500 on a path the
	// user reaches by pressing "mulai".
	limit := int32(0)
	if exam.QuestionCount != nil {
		limit = *exam.QuestionCount
	}
	if limit <= 0 {
		return nil, ErrExamHasNoCards
	}

	out, err := q.DrawRandomCards(ctx, gen.DrawRandomCardsParams{
		UserID:   userID,
		DomainID: exam.DomainID,
		Limit:    limit,
	})
	if err != nil {
		return nil, fmt.Errorf("store: drawing cards: %w", err)
	}
	return out, nil
}
