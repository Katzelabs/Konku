package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/srs"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// ErrCardNotFound covers a missing card, a deleted one, and one owned by
// somebody else. Deliberately indistinguishable (D-039).
var ErrCardNotFound = errors.New("store: card not found")

// TypeBasic is the only card type written today. The column's CHECK still
// admits cloze and feynman so v0.2 needs no migration (D-031).
const TypeBasic = "basic"

// CardInput is one card save.
//
// Front and Back are markdown and may span lines. They were single-line
// strings until D-055 only because the parser rejected newlines outright.
//
// CategoryIDs is total, not a delta — same contract as NoteInput.
type CardInput struct {
	DomainID    *uuid.UUID
	Front       string
	Back        string
	CategoryIDs []uuid.UUID
}

// CreateCard writes a card, its schedule and its category links in one
// transaction.
//
// The schedule is not optional and not deferred. A card without one is invisible
// to the due list and to every count that feeds it, so it would be captured,
// look fine in the list, and never once come up for review — silent, and
// exactly the failure this product exists to prevent.
func (s *Store) CreateCard(ctx context.Context, userID uuid.UUID, in CardInput, today srs.Date) (gen.Card, error) {
	var out gen.Card

	err := s.WithTx(ctx, func(q *gen.Queries) error {
		card, err := q.CreateCard(ctx, gen.CreateCardParams{
			UserID:   userID,
			DomainID: in.DomainID,
			Type:     TypeBasic,
			Front:    in.Front,
			Back:     in.Back,
		})
		if err != nil {
			return fmt.Errorf("store: creating card: %w", err)
		}

		if err := createSchedule(ctx, q, userID, card.ID, today); err != nil {
			return err
		}
		if err := syncCardCategories(ctx, q, userID, card.ID, in.CategoryIDs); err != nil {
			return err
		}

		out = card
		return nil
	})
	if err != nil {
		return gen.Card{}, err
	}
	return out, nil
}

// UpdateCard rewrites a card's content and replaces its category links.
//
// The schedule is untouched on purpose, and this is the property that D-019's
// stable IDs existed to protect: editing the wording of a card must never cost
// it months of review history. With a uuid primary key it now comes for free —
// there is no content matching left to get wrong.
func (s *Store) UpdateCard(ctx context.Context, userID, cardID uuid.UUID, in CardInput) (gen.Card, error) {
	var out gen.Card

	err := s.WithTx(ctx, func(q *gen.Queries) error {
		card, err := q.UpdateCard(ctx, gen.UpdateCardParams{
			ID:       cardID,
			UserID:   userID,
			DomainID: in.DomainID,
			Front:    in.Front,
			Back:     in.Back,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrCardNotFound
		}
		if err != nil {
			return fmt.Errorf("store: updating card: %w", err)
		}

		if err := syncCardCategories(ctx, q, userID, cardID, in.CategoryIDs); err != nil {
			return err
		}

		out = card
		return nil
	})
	if err != nil {
		return gen.Card{}, err
	}
	return out, nil
}

// DeleteCard soft-deletes, and RestoreCard undoes it.
//
// Restoring returns the card with its schedule intact, because the schedule
// row was never removed — the FK cascade only fires on a hard delete, which
// nothing does.
func (s *Store) DeleteCard(ctx context.Context, userID, cardID uuid.UUID) error {
	rows, err := s.DeleteCards(ctx, userID, []uuid.UUID{cardID})
	return single(rows, err, ErrCardNotFound)
}

func (s *Store) RestoreCard(ctx context.Context, userID, cardID uuid.UUID) error {
	rows, err := s.RestoreCards(ctx, userID, []uuid.UUID{cardID})
	return single(rows, err, ErrCardNotFound)
}

// DeleteCards soft-deletes a whole selection and reports how many rows changed.
//
// One statement, same contract as DeleteNotes: ids that are missing, already
// deleted, or somebody else's do not match, so the count can be lower than the
// number asked for without that being an error.
func (s *Store) DeleteCards(ctx context.Context, userID uuid.UUID, ids []uuid.UUID) (int64, error) {
	rows, err := s.q.SoftDeleteCards(ctx, gen.SoftDeleteCardsParams{UserID: userID, Ids: ids})
	if err != nil {
		return 0, fmt.Errorf("store: deleting cards: %w", err)
	}
	return rows, nil
}

func (s *Store) RestoreCards(ctx context.Context, userID uuid.UUID, ids []uuid.UUID) (int64, error) {
	rows, err := s.q.RestoreCards(ctx, gen.RestoreCardsParams{UserID: userID, Ids: ids})
	if err != nil {
		return 0, fmt.Errorf("store: restoring cards: %w", err)
	}
	return rows, nil
}

// createSchedule gives a fresh card its first due date.
//
// ON CONFLICT DO NOTHING means no rows come back for a card that already has
// one, which is the expected path when a deleted card is restored — not a
// failure.
func createSchedule(ctx context.Context, q *gen.Queries, userID, cardID uuid.UUID, today srs.Date) error {
	sched := srs.NewSchedule(cardID.String(), today)

	due, err := ToTimePtr(sched.NextReview)
	if err != nil {
		return fmt.Errorf("store: scheduling card %s: %w", cardID, err)
	}

	if _, err := q.CreateSchedule(ctx, gen.CreateScheduleParams{
		CardID:         cardID,
		UserID:         userID,
		Stage:          int32(sched.Stage),
		NextReviewDate: due,
		State:          string(sched.State),
	}); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("store: scheduling card %s: %w", cardID, err)
	}
	return nil
}

// syncCardCategories replaces a card's labels wholesale, same contract and
// same reasoning as syncNoteCategories.
func syncCardCategories(ctx context.Context, q *gen.Queries, userID, cardID uuid.UUID, categoryIDs []uuid.UUID) error {
	if err := q.ClearCardCategories(ctx, gen.ClearCardCategoriesParams{
		CardID: cardID, UserID: userID,
	}); err != nil {
		return fmt.Errorf("store: clearing card categories: %w", err)
	}

	for _, categoryID := range categoryIDs {
		if err := q.AddCardCategory(ctx, gen.AddCardCategoryParams{
			UserID:     userID,
			CardID:     cardID,
			CategoryID: categoryID,
		}); err != nil {
			return fmt.Errorf("store: adding card category %s: %w", categoryID, err)
		}
	}
	return nil
}
