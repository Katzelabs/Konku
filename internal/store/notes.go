package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/card"
	"github.com/Katzelabs/Konku/internal/srs"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// ErrNoteNotFound covers both a missing note and one owned by somebody else.
// The two are deliberately indistinguishable: a 403 would confirm that another
// user's note exists, turning the API into a probe (D-039).
var ErrNoteNotFound = errors.New("store: note not found")

// NoteInput is one note save.
type NoteInput struct {
	Title     string
	ContentMd string
	DomainID  *string
}

// SavedNote is a note after its cards have been synced.
//
// Note.ContentMd is the *stored* markdown, not the submitted markdown: it
// carries the IDs Parse assigned to new cards. The handler returns this to the
// editor, which would otherwise keep sending back markdown without them and
// create a fresh card on every save.
type SavedNote struct {
	Note  gen.Note
	Cards []card.Card
}

// CreateNoteWithCards writes a new note and the cards its markdown contains,
// in one transaction.
func (s *Store) CreateNoteWithCards(ctx context.Context, userID uuid.UUID, in NoteInput, today srs.Date) (SavedNote, error) {
	cards, md, err := card.Parse(in.ContentMd)
	if err != nil {
		return SavedNote{}, fmt.Errorf("store: parsing cards: %w", err)
	}

	var out SavedNote
	err = s.WithTx(ctx, func(q *gen.Queries) error {
		note, err := q.CreateNote(ctx, gen.CreateNoteParams{
			UserID:    userID,
			Title:     in.Title,
			ContentMd: md,
			DomainID:  in.DomainID,
		})
		if err != nil {
			return fmt.Errorf("store: creating note: %w", err)
		}

		if err := syncCards(ctx, q, note.ID, userID, cards, today); err != nil {
			return err
		}

		out = SavedNote{Note: note, Cards: cards}
		return nil
	})
	if err != nil {
		return SavedNote{}, err
	}
	return out, nil
}

// UpdateNoteWithCards saves a note and reconciles its cards.
//
// The note row and every card change commit together. A note stored with its
// cards half-synced is a corrupt state with no obvious repair path: the
// markdown says one thing, the cards table another, and nothing detects it.
func (s *Store) UpdateNoteWithCards(ctx context.Context, userID, noteID uuid.UUID, in NoteInput, today srs.Date) (SavedNote, error) {
	cards, md, err := card.Parse(in.ContentMd)
	if err != nil {
		return SavedNote{}, fmt.Errorf("store: parsing cards: %w", err)
	}

	var out SavedNote
	err = s.WithTx(ctx, func(q *gen.Queries) error {
		// The parsed markdown, never the submitted markdown — it is the only
		// copy that carries the newly assigned IDs.
		note, err := q.UpdateNote(ctx, gen.UpdateNoteParams{
			ID:        noteID,
			UserID:    userID,
			Title:     in.Title,
			ContentMd: md,
			DomainID:  in.DomainID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNoteNotFound
		}
		if err != nil {
			return fmt.Errorf("store: updating note: %w", err)
		}

		if err := syncCards(ctx, q, noteID, userID, cards, today); err != nil {
			return err
		}

		out = SavedNote{Note: note, Cards: cards}
		return nil
	})
	if err != nil {
		return SavedNote{}, err
	}
	return out, nil
}

// syncCards reconciles the note's card rows with what the markdown now says.
//
// The diff is **by ID only**. Matching on content would make fixing a typo
// look like "old card deleted, new card created": the schedule resets to stage
// 0 and months of review history are gone. That is the single most damaging
// bug available in this codebase, and it is completely silent (D-019).
func syncCards(ctx context.Context, q *gen.Queries, noteID, userID uuid.UUID, cards []card.Card, today srs.Date) error {
	existing, err := q.ListCardsByNote(ctx, gen.ListCardsByNoteParams{NoteID: noteID, UserID: userID})
	if err != nil {
		return fmt.Errorf("store: listing cards to sync: %w", err)
	}

	live := make(map[string]bool, len(cards))
	for _, c := range cards {
		live[c.ID] = true

		if _, err := q.UpsertCard(ctx, gen.UpsertCardParams{
			ID:     c.ID,
			NoteID: noteID,
			UserID: userID,
			Type:   string(c.Type),
			Front:  c.Front,
			Back:   c.Back,
			Line:   int32(c.Line),
		}); err != nil {
			return fmt.Errorf("store: upserting card %q: %w", c.ID, err)
		}

		// Scheduled for every parsed card, not just the ones that look new.
		// CreateSchedule is ON CONFLICT DO NOTHING, so a card that already has
		// a schedule keeps it untouched — which is what makes an edit free and
		// a restored card come back with its history. Running it
		// unconditionally also means a card can never end up without a
		// schedule and therefore unreviewable.
		sched := srs.NewSchedule(c.ID, today)
		due, err := ToTimePtr(sched.NextReview)
		if err != nil {
			return fmt.Errorf("store: scheduling card %q: %w", c.ID, err)
		}
		// No conflict returns no row, which is the expected path for a card
		// that already has a schedule, not a failure.
		if _, err := q.CreateSchedule(ctx, gen.CreateScheduleParams{
			NoteID:         noteID,
			CardID:         c.ID,
			UserID:         userID,
			Stage:          int32(sched.Stage),
			NextReviewDate: due,
			State:          string(sched.State),
		}); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("store: scheduling card %q: %w", c.ID, err)
		}
	}

	// A card whose ID vanished from the markdown is soft-deleted, never hard
	// deleted. Deleting a line, saving, and undoing must give the review
	// history back.
	for _, c := range existing {
		if live[c.ID] {
			continue
		}
		if err := q.SoftDeleteCard(ctx, gen.SoftDeleteCardParams{
			NoteID: noteID,
			ID:     c.ID,
			UserID: userID,
		}); err != nil {
			return fmt.Errorf("store: soft-deleting card %q: %w", c.ID, err)
		}
	}

	return nil
}
