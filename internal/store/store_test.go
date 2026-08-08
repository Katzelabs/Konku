package store_test

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/srs"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Integration tests run against the dev Postgres from docker-compose.yml.
// Skipped when TEST_DATABASE_URL is unset so `go test ./...` stays green on a
// machine without Docker.
func newStore(t *testing.T) (*store.Store, context.Context) {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; run `make test-integration`")
	}

	ctx := context.Background()
	st, err := store.Open(ctx, url)
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	t.Cleanup(st.Close)

	if err := st.Migrate(ctx); err != nil {
		t.Fatalf("migrating: %v", err)
	}
	return st, ctx
}

// newUser creates a throwaway user. Deleting it cascades to their notes,
// cards, schedules and logs, so tests leave no residue.
func newUser(t *testing.T, st *store.Store, ctx context.Context) gen.User {
	t.Helper()

	u, err := st.Q().CreateUser(ctx, gen.CreateUserParams{
		Email:        "test-" + uuid.NewString() + "@example.com",
		PasswordHash: "not-a-real-hash",
	})
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = st.Pool().Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})
	return u
}

// newCard creates a live card with its schedule, the way the API does.
func newCard(t *testing.T, st *store.Store, ctx context.Context, userID uuid.UUID, front, back string) gen.Card {
	t.Helper()

	c, err := st.CreateCard(ctx, userID, store.CardInput{Front: front, Back: back}, srs.Date("2026-08-05"))
	if err != nil {
		t.Fatalf("creating card: %v", err)
	}
	return c
}

// TestTenantIsolation is the reason this file exists.
//
// D-039 requires that a row belonging to another user is indistinguishable
// from a row that does not exist. If any of these assertions fail, the API can
// be used to discover other users' data.
func TestTenantIsolation(t *testing.T) {
	st, ctx := newStore(t)
	alice := newUser(t, st, ctx)
	bob := newUser(t, st, ctx)

	note, err := st.Q().CreateNote(ctx, gen.CreateNoteParams{
		UserID:    alice.ID,
		Title:     "Teorema Bayes",
		ContentMd: "P(A|B) = P(B|A)P(A)/P(B)",
	})
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}
	card := newCard(t, st, ctx, alice.ID, "Apa itu prior?", "Keyakinan awal")

	t.Run("bob cannot read alice's note", func(t *testing.T) {
		_, err := st.Q().GetNote(ctx, gen.GetNoteParams{ID: note.ID, UserID: bob.ID})
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("got %v, want ErrNoRows — a wrong owner must be indistinguishable from a missing row", err)
		}
	})

	t.Run("bob cannot update alice's note", func(t *testing.T) {
		_, err := st.Q().UpdateNote(ctx, gen.UpdateNoteParams{
			ID: note.ID, UserID: bob.ID, Title: "hijacked", ContentMd: "hijacked",
		})
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("got %v, want ErrNoRows", err)
		}

		// And the note is genuinely untouched.
		after, err := st.Q().GetNote(ctx, gen.GetNoteParams{ID: note.ID, UserID: alice.ID})
		if err != nil {
			t.Fatalf("re-reading note: %v", err)
		}
		if after.Title != "Teorema Bayes" {
			t.Fatalf("title = %q, want unchanged", after.Title)
		}
	})

	t.Run("bob cannot delete alice's note", func(t *testing.T) {
		if err := st.DeleteNote(ctx, bob.ID, note.ID); !errors.Is(err, store.ErrNoteNotFound) {
			t.Fatalf("got %v, want ErrNoteNotFound", err)
		}

		// And alice's note is genuinely still there, not soft-deleted by the
		// attempt: the user_id in the WHERE clause is what makes the delete a
		// no-op rather than anything checked afterwards.
		if _, err := st.Q().GetNote(ctx, gen.GetNoteParams{ID: note.ID, UserID: alice.ID}); err != nil {
			t.Fatalf("re-reading alice's note: %v", err)
		}
	})

	t.Run("alice's note is absent from bob's list", func(t *testing.T) {
		list, err := st.Q().ListNotes(ctx, gen.ListNotesParams{UserID: bob.ID, Limit: 100})
		if err != nil {
			t.Fatalf("listing: %v", err)
		}
		for _, n := range list {
			if n.ID == note.ID {
				t.Fatal("alice's note leaked into bob's list")
			}
		}
	})

	// Cards are a top-level resource now (D-055), so they need the same
	// guarantees the notes above do rather than inheriting them from a parent.
	t.Run("bob cannot read alice's card", func(t *testing.T) {
		_, err := st.Q().GetCard(ctx, gen.GetCardParams{ID: card.ID, UserID: bob.ID})
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("got %v, want ErrNoRows", err)
		}
	})

	t.Run("bob cannot update alice's card", func(t *testing.T) {
		_, err := st.UpdateCard(ctx, bob.ID, card.ID, store.CardInput{Front: "hijacked", Back: "hijacked"})
		if !errors.Is(err, store.ErrCardNotFound) {
			t.Fatalf("got %v, want ErrCardNotFound", err)
		}

		after, err := st.Q().GetCard(ctx, gen.GetCardParams{ID: card.ID, UserID: alice.ID})
		if err != nil {
			t.Fatalf("re-reading card: %v", err)
		}
		if after.Front != "Apa itu prior?" {
			t.Fatalf("front = %q, want unchanged", after.Front)
		}
	})

	t.Run("bob cannot delete alice's card", func(t *testing.T) {
		if err := st.DeleteCard(ctx, bob.ID, card.ID); !errors.Is(err, store.ErrCardNotFound) {
			t.Fatalf("got %v, want ErrCardNotFound", err)
		}
	})

	t.Run("alice's card is absent from bob's list", func(t *testing.T) {
		list, err := st.Q().ListCards(ctx, gen.ListCardsParams{UserID: bob.ID, Limit: 100})
		if err != nil {
			t.Fatalf("listing: %v", err)
		}
		for _, c := range list {
			if c.ID == card.ID {
				t.Fatal("alice's card leaked into bob's list")
			}
		}
	})
}

// TestScheduleSurvivesCardEdit guards the most damaging silent bug this
// codebase ever had available to it: an edit that resets review history.
//
// It used to be a real hazard — cards were matched out of markdown, and
// matching by content instead of by stable ID would reset the schedule
// whenever a typo was fixed (D-019). D-055 made the card a row with a uuid, so
// an edit is an UPDATE and the schedule is not in its path at all. The test
// stays because the property is what matters, not the mechanism that provided
// it.
func TestScheduleSurvivesCardEdit(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	card := newCard(t, st, ctx, user.ID, "Apa itu prior?", "Keyakinan awal")

	// Put it well up the ladder, so a reset would be unmistakable.
	due, _ := store.ToTimePtr("2026-09-01")
	if _, err := st.Q().UpdateSchedule(ctx, gen.UpdateScheduleParams{
		CardID: card.ID, UserID: user.ID,
		Stage: 4, NextReviewDate: due, Lapses: 2, State: "learning",
	}); err != nil {
		t.Fatalf("advancing schedule: %v", err)
	}

	if _, err := st.UpdateCard(ctx, user.ID, card.ID, store.CardInput{
		Front: "Apa itu prior (probabilitas)?",
		Back:  "Keyakinan awal sebelum data",
	}); err != nil {
		t.Fatalf("editing card: %v", err)
	}

	got, err := st.Q().GetCardWithSchedule(ctx, gen.GetCardWithScheduleParams{
		ID: card.ID, UserID: user.ID,
	})
	if err != nil {
		t.Fatalf("reading card: %v", err)
	}
	if got.CardSchedule.Stage != 4 {
		t.Errorf("stage = %d, want 4 — editing card text must not reset the schedule", got.CardSchedule.Stage)
	}
	if got.CardSchedule.Lapses != 2 {
		t.Errorf("lapses = %d, want 2", got.CardSchedule.Lapses)
	}
	if store.FromTimePtr(got.CardSchedule.NextReviewDate) != "2026-09-01" {
		t.Errorf("next_review_date = %v, want 2026-09-01", store.FromTimePtr(got.CardSchedule.NextReviewDate))
	}
	if got.Card.Front != "Apa itu prior (probabilitas)?" {
		t.Errorf("front was not updated: %q", got.Card.Front)
	}
}

// TestSoftDeleteRestoresHistory: deleting a card and undoing it must return the
// review history, not start it over.
func TestSoftDeleteRestoresHistory(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	card := newCard(t, st, ctx, user.ID, "q", "a")

	due, _ := store.ToTimePtr("2026-10-01")
	if _, err := st.Q().UpdateSchedule(ctx, gen.UpdateScheduleParams{
		CardID: card.ID, UserID: user.ID,
		Stage: 5, NextReviewDate: due, State: "learning",
	}); err != nil {
		t.Fatalf("schedule: %v", err)
	}

	if err := st.DeleteCard(ctx, user.ID, card.ID); err != nil {
		t.Fatalf("soft delete: %v", err)
	}

	live, err := st.Q().ListCards(ctx, gen.ListCardsParams{UserID: user.ID, Limit: 100})
	if err != nil {
		t.Fatalf("listing: %v", err)
	}
	for _, c := range live {
		if c.ID == card.ID {
			t.Fatal("a deleted card is still in the list")
		}
	}

	// A second delete finds nothing live to delete, which is what makes the
	// button idempotent rather than a way to double-stamp deleted_at.
	if err := st.DeleteCard(ctx, user.ID, card.ID); !errors.Is(err, store.ErrCardNotFound) {
		t.Errorf("second delete: got %v, want ErrCardNotFound", err)
	}

	if err := st.RestoreCard(ctx, user.ID, card.ID); err != nil {
		t.Fatalf("restore: %v", err)
	}

	got, err := st.Q().GetCardWithSchedule(ctx, gen.GetCardWithScheduleParams{
		ID: card.ID, UserID: user.ID,
	})
	if err != nil {
		t.Fatalf("reading restored card: %v", err)
	}
	if got.CardSchedule.Stage != 5 {
		t.Errorf("stage = %d, want 5 — restoring a card must restore its history", got.CardSchedule.Stage)
	}
}

// TestWithTxRollsBack: a failure mid-write must leave nothing behind.
func TestWithTxRollsBack(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	sentinel := errors.New("boom")
	var noteID uuid.UUID

	err := st.WithTx(ctx, func(q *gen.Queries) error {
		n, err := q.CreateNote(ctx, gen.CreateNoteParams{
			UserID: user.ID, Title: "should not survive", ContentMd: "x",
		})
		if err != nil {
			return err
		}
		noteID = n.ID
		return sentinel
	})

	if !errors.Is(err, sentinel) {
		t.Fatalf("got %v, want the sentinel error propagated", err)
	}

	if _, err := st.Q().GetNote(ctx, gen.GetNoteParams{ID: noteID, UserID: user.ID}); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("note survived a rolled-back transaction: %v", err)
	}
}

// TestCardCreationIsAtomic: a card and its schedule commit together, or not at
// all. A card without a schedule is invisible to the due list and to every
// count that feeds it — captured, looks fine in the list, never once comes up
// for review.
func TestCardCreationIsAtomic(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	// A category id that belongs to nobody fails the composite foreign key
	// inside the transaction, after the card row has already been inserted.
	_, err := st.CreateCard(ctx, user.ID, store.CardInput{
		Front:       "q",
		Back:        "a",
		CategoryIDs: []uuid.UUID{uuid.New()},
	}, srs.Date("2026-08-05"))
	if err == nil {
		t.Fatal("creating a card with an unknown category succeeded, want a foreign key error")
	}

	cards, err := st.Q().ListCards(ctx, gen.ListCardsParams{UserID: user.ID, Limit: 100})
	if err != nil {
		t.Fatalf("listing: %v", err)
	}
	if len(cards) != 0 {
		t.Fatalf("got %d cards after a failed create, want 0 — the card row outlived its transaction", len(cards))
	}
}

// TestDueCardsExcludeMastered: a mastered card has a NULL next_review_date.
// With emit_pointers_for_null_types off, that would decode as the zero date
// and every mastered card would jump to the front of the due list.
func TestDueCardsExcludeMastered(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	add := func(front, state string, due *time.Time) uuid.UUID {
		t.Helper()
		c := newCard(t, st, ctx, user.ID, front, "a")
		if _, err := st.Q().UpdateSchedule(ctx, gen.UpdateScheduleParams{
			CardID: c.ID, UserID: user.ID,
			Stage: 0, NextReviewDate: due, State: state,
		}); err != nil {
			t.Fatalf("schedule %s: %v", front, err)
		}
		return c.ID
	}

	overdue, _ := store.ToTimePtr("2026-07-01")
	future, _ := store.ToTimePtr("2099-01-01")
	wantID := add("overdue", "learning", overdue)
	add("future", "learning", future)
	add("mastered", "mastered", nil)

	today, _ := store.ToTime("2026-08-05")
	rows, err := st.Q().ListDueCards(ctx, gen.ListDueCardsParams{
		UserID: user.ID, Today: today, Limit: 10,
	})
	if err != nil {
		t.Fatalf("listing due: %v", err)
	}

	if len(rows) != 1 {
		var fronts []string
		for _, r := range rows {
			fronts = append(fronts, r.Front)
		}
		t.Fatalf("due = %v, want only the overdue learning card", fronts)
	}
	if rows[0].ID != wantID {
		t.Errorf("due card = %q, want the overdue one", rows[0].Front)
	}
}
