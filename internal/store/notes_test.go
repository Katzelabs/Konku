package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// These used to test the card-sync transaction: parse the markdown, diff the
// cards by ID, commit both together. D-055 took cards out of the note, so what
// is left to guard is the note's other transactional companion — its category
// links.

func newCategory(t *testing.T, st *store.Store, ctx context.Context, userID uuid.UUID, slug string) gen.Category {
	t.Helper()

	c, err := st.Q().CreateCategory(ctx, gen.CreateCategoryParams{
		UserID: userID, Slug: slug, Label: slug,
	})
	if err != nil {
		t.Fatalf("creating category %q: %v", slug, err)
	}
	return c
}

func noteCategoryIDs(t *testing.T, st *store.Store, ctx context.Context, userID, noteID uuid.UUID) []uuid.UUID {
	t.Helper()

	rows, err := st.Q().ListCategoriesForNote(ctx, gen.ListCategoriesForNoteParams{
		NoteID: noteID, UserID: userID,
	})
	if err != nil {
		t.Fatalf("listing note categories: %v", err)
	}
	out := make([]uuid.UUID, 0, len(rows))
	for _, c := range rows {
		out = append(out, c.ID)
	}
	return out
}

func TestCreateNoteWithCategories(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	math := newCategory(t, st, ctx, user.ID, "math")
	stats := newCategory(t, st, ctx, user.ID, "statistik")

	note, err := st.CreateNote(ctx, user.ID, store.NoteInput{
		Title:       "Teorema Bayes",
		ContentMd:   "P(A|B) = P(B|A)P(A)/P(B)",
		CategoryIDs: []uuid.UUID{math.ID, stats.ID},
	})
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}

	if got := len(noteCategoryIDs(t, st, ctx, user.ID, note.ID)); got != 2 {
		t.Fatalf("got %d categories, want 2", got)
	}

	// The markdown is stored verbatim. It used to come back rewritten, because
	// the parser wrote card IDs into it; nothing rewrites a note now.
	if note.ContentMd != "P(A|B) = P(B|A)P(A)/P(B)" {
		t.Errorf("content = %q, want it stored unchanged", note.ContentMd)
	}
}

// TestCategorySyncIsTotal: the input is the complete set, not a delta.
func TestCategorySyncIsTotal(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	math := newCategory(t, st, ctx, user.ID, "math")
	stats := newCategory(t, st, ctx, user.ID, "statistik")

	note, err := st.CreateNote(ctx, user.ID, store.NoteInput{
		Title:       "n",
		CategoryIDs: []uuid.UUID{math.ID, stats.ID},
	})
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}

	if _, err := st.UpdateNote(ctx, user.ID, note.ID, store.NoteInput{
		Title:       "n",
		CategoryIDs: []uuid.UUID{stats.ID},
	}); err != nil {
		t.Fatalf("updating note: %v", err)
	}

	got := noteCategoryIDs(t, st, ctx, user.ID, note.ID)
	if len(got) != 1 || got[0] != stats.ID {
		t.Fatalf("got %v, want only %v — the set is replaced, not merged", got, stats.ID)
	}

	// nil clears, which is what makes "remove the last label" expressible.
	if _, err := st.UpdateNote(ctx, user.ID, note.ID, store.NoteInput{Title: "n"}); err != nil {
		t.Fatalf("clearing categories: %v", err)
	}
	if got := noteCategoryIDs(t, st, ctx, user.ID, note.ID); len(got) != 0 {
		t.Fatalf("got %v, want none", got)
	}
}

// TestCategorySyncCommitsWithTheNote: the note row and its labels are one
// write. A note stored with its labels half-applied is not obviously broken to
// anything that reads it, which is the kind of corruption that survives.
func TestCategorySyncCommitsWithTheNote(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	math := newCategory(t, st, ctx, user.ID, "math")

	note, err := st.CreateNote(ctx, user.ID, store.NoteInput{
		Title:       "asli",
		CategoryIDs: []uuid.UUID{math.ID},
	})
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}

	// The second id belongs to nobody, so the composite foreign key rejects it
	// (D-047) — after the note row has already been updated in the same
	// transaction, and after the existing links were cleared.
	_, err = st.UpdateNote(ctx, user.ID, note.ID, store.NoteInput{
		Title:       "diubah",
		CategoryIDs: []uuid.UUID{math.ID, uuid.New()},
	})
	if err == nil {
		t.Fatal("updating with an unknown category succeeded, want a foreign key error")
	}

	after, err := st.Q().GetNote(ctx, gen.GetNoteParams{ID: note.ID, UserID: user.ID})
	if err != nil {
		t.Fatalf("re-reading note: %v", err)
	}
	if after.Title != "asli" {
		t.Errorf("title = %q, want %q — the note update outlived its failed transaction", after.Title, "asli")
	}

	got := noteCategoryIDs(t, st, ctx, user.ID, note.ID)
	if len(got) != 1 || got[0] != math.ID {
		t.Errorf("got %v, want the original label back — the clear outlived its failed transaction", got)
	}
}

// TestNoteCategoriesAreScoped: a category belonging to somebody else cannot be
// attached, and the foreign key is what stops it rather than a check in Go.
func TestNoteCategoriesAreScoped(t *testing.T) {
	st, ctx := newStore(t)
	alice := newUser(t, st, ctx)
	bob := newUser(t, st, ctx)

	bobs := newCategory(t, st, ctx, bob.ID, "bobs")

	_, err := st.CreateNote(ctx, alice.ID, store.NoteInput{
		Title:       "n",
		CategoryIDs: []uuid.UUID{bobs.ID},
	})
	if err == nil {
		t.Fatal("alice attached bob's category to her note")
	}
}

func TestUpdateMissingNote(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	_, err := st.UpdateNote(ctx, user.ID, uuid.New(), store.NoteInput{Title: "x"})
	if !errors.Is(err, store.ErrNoteNotFound) {
		t.Fatalf("got %v, want ErrNoteNotFound", err)
	}
}
