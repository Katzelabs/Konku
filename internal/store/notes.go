package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// ErrNoteNotFound covers both a missing note and one owned by somebody else.
// The two are deliberately indistinguishable: a 403 would confirm that another
// user's note exists, turning the API into a probe (D-039).
var ErrNoteNotFound = errors.New("store: note not found")

// NoteInput is one note save.
//
// DomainID is nil for an untagged note. Domains and categories are both
// per-user (D-046), so one belonging to somebody else is rejected by the
// composite foreign key rather than by anything here (D-047).
//
// CategoryIDs is total, not a delta: whatever is passed becomes the note's
// complete set, and nil clears it. Callers doing a partial update read the
// current set first — the same shape the handler already uses for DomainID.
type NoteInput struct {
	Title       string
	ContentMd   string
	DomainID    *uuid.UUID
	CategoryIDs []uuid.UUID
}

// CreateNote writes a note and its category links in one transaction.
//
// It used to parse cards out of the markdown and sync them here. D-055 moved
// cards out of the note body entirely, so a note save is now a note save.
func (s *Store) CreateNote(ctx context.Context, userID uuid.UUID, in NoteInput) (gen.Note, error) {
	var out gen.Note

	err := s.WithTx(ctx, func(q *gen.Queries) error {
		note, err := q.CreateNote(ctx, gen.CreateNoteParams{
			UserID:    userID,
			Title:     in.Title,
			ContentMd: in.ContentMd,
			DomainID:  in.DomainID,
		})
		if err != nil {
			return fmt.Errorf("store: creating note: %w", err)
		}

		if err := syncNoteCategories(ctx, q, userID, note.ID, in.CategoryIDs); err != nil {
			return err
		}

		out = note
		return nil
	})
	if err != nil {
		return gen.Note{}, err
	}
	return out, nil
}

// UpdateNote saves a note and replaces its category links.
//
// Both commit together. A note whose labels were half-written is not obviously
// broken to anything that reads it, which is the kind of corruption that
// survives for months.
func (s *Store) UpdateNote(ctx context.Context, userID, noteID uuid.UUID, in NoteInput) (gen.Note, error) {
	var out gen.Note

	err := s.WithTx(ctx, func(q *gen.Queries) error {
		note, err := q.UpdateNote(ctx, gen.UpdateNoteParams{
			ID:        noteID,
			UserID:    userID,
			Title:     in.Title,
			ContentMd: in.ContentMd,
			DomainID:  in.DomainID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNoteNotFound
		}
		if err != nil {
			return fmt.Errorf("store: updating note: %w", err)
		}

		if err := syncNoteCategories(ctx, q, userID, noteID, in.CategoryIDs); err != nil {
			return err
		}

		out = note
		return nil
	})
	if err != nil {
		return gen.Note{}, err
	}
	return out, nil
}

// DeleteNote soft-deletes one note, and RestoreNote undoes it.
//
// Soft, not hard, and for the user's sake rather than for referential
// integrity: nothing but its own labels points at a note. Deletion on a CRUD
// screen should be undoable, and in an app whose thesis is that nothing you
// learn disappears silently, one click must not destroy writing (00005).
func (s *Store) DeleteNote(ctx context.Context, userID, noteID uuid.UUID) error {
	rows, err := s.DeleteNotes(ctx, userID, []uuid.UUID{noteID})
	return single(rows, err, ErrNoteNotFound)
}

func (s *Store) RestoreNote(ctx context.Context, userID, noteID uuid.UUID) error {
	rows, err := s.RestoreNotes(ctx, userID, []uuid.UUID{noteID})
	return single(rows, err, ErrNoteNotFound)
}

// DeleteNotes soft-deletes a whole selection and reports how many rows changed.
//
// One statement, so the selection either lands or does not — a bulk delete that
// gave up halfway would leave the user looking at a list they cannot reason
// about. Ids that are missing, already deleted, or someone else's simply do not
// match, so the count can be lower than the number asked for; the handler
// reports the count rather than treating that as an error, because "delete
// these twelve" is still satisfied when one of them was already gone.
func (s *Store) DeleteNotes(ctx context.Context, userID uuid.UUID, ids []uuid.UUID) (int64, error) {
	rows, err := s.q.SoftDeleteNotes(ctx, gen.SoftDeleteNotesParams{UserID: userID, Ids: ids})
	if err != nil {
		return 0, fmt.Errorf("store: deleting notes: %w", err)
	}
	return rows, nil
}

func (s *Store) RestoreNotes(ctx context.Context, userID uuid.UUID, ids []uuid.UUID) (int64, error) {
	rows, err := s.q.RestoreNotes(ctx, gen.RestoreNotesParams{UserID: userID, Ids: ids})
	if err != nil {
		return 0, fmt.Errorf("store: restoring notes: %w", err)
	}
	return rows, nil
}

// single turns a bulk result into a single-item one. No row changed means the
// id named nothing this user owns — missing, already deleted, or somebody
// else's, all the same answer (D-039).
func single(rows int64, err error, notFound error) error {
	if err != nil {
		return err
	}
	if rows == 0 {
		return notFound
	}
	return nil
}

// syncNoteCategories replaces a note's labels wholesale.
//
// Clear-then-insert rather than a diff. Labels carry no history — unlike a
// card's schedule, there is nothing in a link row worth preserving across the
// write — so the simplest correct thing is the right one.
func syncNoteCategories(ctx context.Context, q *gen.Queries, userID, noteID uuid.UUID, categoryIDs []uuid.UUID) error {
	if err := q.ClearNoteCategories(ctx, gen.ClearNoteCategoriesParams{
		NoteID: noteID, UserID: userID,
	}); err != nil {
		return fmt.Errorf("store: clearing note categories: %w", err)
	}

	for _, categoryID := range categoryIDs {
		if err := q.AddNoteCategory(ctx, gen.AddNoteCategoryParams{
			UserID:     userID,
			NoteID:     noteID,
			CategoryID: categoryID,
		}); err != nil {
			// A category belonging to another user fails the composite FK
			// here, which is the intended enforcement point (D-047). The
			// handler turns it into a 400, never a 500.
			return fmt.Errorf("store: adding note category %s: %w", categoryID, err)
		}
	}
	return nil
}
