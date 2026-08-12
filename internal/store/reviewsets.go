package store

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// ErrReviewSetNotFound covers a missing set, an archived one, and one owned by
// somebody else. They are deliberately indistinguishable (D-039).
var ErrReviewSetNotFound = errors.New("store: review set not found")

// ErrReviewSetHasNoCards is a real, reachable state, not a corruption: a brand
// new account has no cards yet, and a set filtered to a domain and a category
// that no card carries together has nothing to ask.
var ErrReviewSetHasNoCards = errors.New("store: review set has no cards to draw from")

// How a set asks its questions (D-076). This is a property of the asking, not
// of the card: the same card is free recall in one set and multiple choice in
// another, which is why cards.type stays out of it.
const (
	FormatRecall = "recall"
	FormatChoice = "choice"
)

// choiceCount is how many options a multiple-choice question offers: the
// answer plus three distractors. A question that cannot reach this many
// distinct options is asked as plain recall instead (D-077).
const choiceCount = 4

// distractorPoolSize caps the candidate pool read for one run. Large enough
// that a 100-question run still has variety, small enough that a big account
// does not pull its whole card table into memory to start a quiz.
const distractorPoolSize = 300

// StartedRun is the result of starting or resuming a review run.
type StartedRun struct {
	Run gen.ReviewRun
	// Resumed reports that an unfinished run already existed and was returned
	// instead of a new one.
	Resumed bool
}

// StartRun begins a sitting of a review set, or hands back the one already in
// progress.
//
// The run row, its question snapshot and every question's options commit
// together. Without the snapshot a random draw would exist only in memory, so
// closing the tab halfway would lose every unanswered question and resuming
// would silently re-draw a different set (D-050). The options are part of that
// same guarantee: choices regenerated on resume would mean the second half of
// a run answers a different question from the first.
//
// Starting is idempotent on purpose. A set has at most one open run — a
// partial unique index enforces it — so a second "mulai" is what a user
// pressing the button again after a refresh means, and it should return them
// to where they were rather than fail.
func (s *Store) StartRun(
	ctx context.Context,
	userID, setID uuid.UUID,
	runDate time.Time,
) (StartedRun, error) {
	var out StartedRun

	err := s.WithUserTx(ctx, userID, func(q *gen.Queries) error {
		set, err := q.GetReviewSet(ctx, gen.GetReviewSetParams{ID: setID, UserID: userID})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrReviewSetNotFound
		}
		if err != nil {
			return fmt.Errorf("store: reading review set: %w", err)
		}
		if set.ArchivedAt != nil {
			return ErrReviewSetNotFound
		}

		open, err := q.GetOpenRun(ctx, gen.GetOpenRunParams{
			SetID: setID, UserID: userID,
		})
		if err == nil {
			out = StartedRun{Run: open, Resumed: true}
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("store: reading open run: %w", err)
		}

		// The filters travel with the set row rather than in two extra reads:
		// an empty array is a set that draws from the whole knowledge base.
		filters := setFilters{
			domainIDs:   set.DomainIds,
			categoryIDs: set.CategoryIds,
		}

		questions, err := drawQuestions(ctx, q, userID, set, filters)
		if err != nil {
			return err
		}
		if len(questions) == 0 {
			return ErrReviewSetHasNoCards
		}

		// Built before the run row exists so that a failure here costs nothing
		// — an empty run with no questions is worse than no run at all.
		choices, err := buildChoices(ctx, q, userID, set, filters, questions)
		if err != nil {
			return err
		}

		run, err := q.CreateRun(ctx, gen.CreateRunParams{
			SetID:   setID,
			UserID:  userID,
			RunDate: runDate,
		})
		if err != nil {
			return fmt.Errorf("store: creating run: %w", err)
		}

		for i, cardID := range questions {
			params := gen.SnapshotRunCardParams{
				RunID:    run.ID,
				UserID:   userID,
				CardID:   cardID,
				Position: int32(i + 1),
			}
			if c, ok := choices[cardID]; ok {
				idx := c.correctIndex
				params.Options = c.options
				params.CorrectIndex = &idx
			}
			if err := q.SnapshotRunCard(ctx, params); err != nil {
				return fmt.Errorf("store: snapshotting question %d: %w", i+1, err)
			}
		}

		out = StartedRun{Run: run}
		return nil
	})
	if err != nil {
		return StartedRun{}, err
	}
	return out, nil
}

// setFilters is the set's draw scope. Empty slices mean unfiltered, which is
// how a set with nothing chosen draws from the whole knowledge base.
type setFilters struct {
	domainIDs   []uuid.UUID
	categoryIDs []uuid.UUID
}

// drawQuestions picks the card set for one sitting, in presentation order.
//
// 'fixed' reads the pinned set, so two runs of the same set compare like for
// like. 'random' draws afresh, which is better practice and makes scores
// non-comparable — the trade-off is the user's to make per set (D-048).
func drawQuestions(
	ctx context.Context,
	q *gen.Queries,
	userID uuid.UUID,
	set gen.GetReviewSetRow,
	filters setFilters,
) ([]uuid.UUID, error) {
	if set.Selection == "fixed" {
		rows, err := q.ListSetCards(ctx, gen.ListSetCardsParams{
			SetID: set.ID, UserID: userID,
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

	// A 'random' set always carries a question_count — a CHECK constraint ties
	// the two together — so the nil case cannot happen through the API.
	// Guarding anyway, because a nil deref here would be a 500 on a path the
	// user reaches by pressing "mulai".
	want := int32(0)
	if set.QuestionCount != nil {
		want = *set.QuestionCount
	}
	if want <= 0 {
		return nil, ErrReviewSetHasNoCards
	}

	out, err := q.DrawRandomCards(ctx, gen.DrawRandomCardsParams{
		UserID:      userID,
		DomainIds:   filters.domainIDs,
		CategoryIds: filters.categoryIDs,
		Want:        want,
	})
	if err != nil {
		return nil, fmt.Errorf("store: drawing cards: %w", err)
	}
	return out, nil
}

// choice is one question's options in presentation order, and which of them is
// right. The index never leaves the server on a read path — grading happens
// here, not in the browser.
type choice struct {
	options      []string
	correctIndex int32
}

// buildChoices turns each drawn card into a multiple-choice question.
//
// A card is left out of the result — and so asked as plain recall — when it
// has no answer text, or when the account does not hold enough other distinct
// answers to fill the options. Degrading one question is much better than
// refusing to start the run: a new account with three cards should still be
// able to press "mulai" on a set it just made.
func buildChoices(
	ctx context.Context,
	q *gen.Queries,
	userID uuid.UUID,
	set gen.GetReviewSetRow,
	filters setFilters,
	questions []uuid.UUID,
) (map[uuid.UUID]choice, error) {
	if set.Format != FormatChoice {
		return nil, nil
	}

	rows, err := q.ListCardBacks(ctx, gen.ListCardBacksParams{
		UserID: userID, CardIds: questions,
	})
	if err != nil {
		return nil, fmt.Errorf("store: reading answers for choices: %w", err)
	}
	backs := make(map[uuid.UUID]string, len(rows))
	for _, row := range rows {
		backs[row.ID] = row.Back
	}

	pool, err := q.ListDistractorPool(ctx, gen.ListDistractorPoolParams{
		UserID:      userID,
		DomainIds:   filters.domainIDs,
		CategoryIds: filters.categoryIDs,
		Want:        distractorPoolSize,
	})
	if err != nil {
		return nil, fmt.Errorf("store: reading distractor pool: %w", err)
	}

	// A set narrowed to a handful of cards cannot fill four options from
	// inside its own filters. Widening to the whole account keeps the format
	// the user chose, at the cost of distractors from another subject — which
	// is a weaker question, but a question, and the alternative is silently
	// dropping the format they asked for.
	if len(pool) < choiceCount {
		pool, err = q.ListDistractorPool(ctx, gen.ListDistractorPoolParams{
			UserID: userID,
			Want:   distractorPoolSize,
		})
		if err != nil {
			return nil, fmt.Errorf("store: widening distractor pool: %w", err)
		}
	}

	out := make(map[uuid.UUID]choice, len(questions))
	for _, cardID := range questions {
		correct, ok := backs[cardID]
		if !ok || correct == "" {
			continue
		}
		if c, ok := makeChoice(correct, pool); ok {
			out[cardID] = c
		}
	}
	return out, nil
}

// makeChoice assembles one question's options: the answer plus distinct
// distractors drawn from the pool, shuffled so the right one is not always in
// the same place.
//
// Reports false when the pool cannot supply enough distinct wrong answers,
// which is the caller's signal to ask the question as recall.
func makeChoice(correct string, pool []string) (choice, bool) {
	if len(pool) == 0 {
		return choice{}, false
	}

	options := make([]string, 0, choiceCount)
	options = append(options, correct)
	seen := map[string]bool{correct: true}

	// One pool serves every question in the run, so walking it from the front
	// each time would hand all of them the same three distractors. Starting at
	// a random offset and wrapping keeps one pass over the pool while giving
	// each question its own window into it.
	start := rand.IntN(len(pool))
	for i := 0; i < len(pool) && len(options) < choiceCount; i++ {
		back := pool[(start+i)%len(pool)]
		if seen[back] {
			continue
		}
		seen[back] = true
		options = append(options, back)
	}
	if len(options) < choiceCount {
		return choice{}, false
	}

	rand.Shuffle(len(options), func(i, j int) {
		options[i], options[j] = options[j], options[i]
	})
	for i, opt := range options {
		if opt == correct {
			return choice{options: options, correctIndex: int32(i)}, true
		}
	}
	// Unreachable: correct was seeded into options above and the shuffle only
	// permutes. Returning false rather than a wrong index keeps the failure
	// mode "asked as recall" instead of "graded against the wrong option".
	return choice{}, false
}
