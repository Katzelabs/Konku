package store_test

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

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
		rows, err := st.Q().DeleteNote(ctx, gen.DeleteNoteParams{ID: note.ID, UserID: bob.ID})
		if err != nil {
			t.Fatalf("delete: %v", err)
		}
		if rows != 0 {
			t.Fatalf("deleted %d rows, want 0", rows)
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
}

// TestScheduleSurvivesCardEdit guards the most damaging silent bug available
// in this codebase: matching cards by content instead of by stable ID, which
// resets review history whenever a typo is fixed (D-019).
func TestScheduleSurvivesCardEdit(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	note, err := st.Q().CreateNote(ctx, gen.CreateNoteParams{
		UserID: user.ID, Title: "n", ContentMd: "x",
	})
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}

	const cardID = "k3n8"
	mustUpsert := func(front, back string) {
		t.Helper()
		if _, err := st.Q().UpsertCard(ctx, gen.UpsertCardParams{
			ID: cardID, NoteID: note.ID, UserID: user.ID,
			Type: "basic", Front: front, Back: back,
		}); err != nil {
			t.Fatalf("upserting card: %v", err)
		}
	}

	mustUpsert("Apa itu prior?", "Keyakinan awal")

	due, _ := store.ToTimePtr("2026-09-01")
	if _, err := st.Q().CreateSchedule(ctx, gen.CreateScheduleParams{
		NoteID: note.ID, CardID: cardID, UserID: user.ID,
		Stage: 4, NextReviewDate: due, State: "learning",
	}); err != nil {
		t.Fatalf("creating schedule: %v", err)
	}

	// Fix a typo in the card text, exactly as a note edit would.
	mustUpsert("Apa itu prior (probabilitas)?", "Keyakinan awal sebelum data")

	got, err := st.Q().GetCardWithSchedule(ctx, gen.GetCardWithScheduleParams{
		NoteID: note.ID, ID: cardID, UserID: user.ID,
	})
	if err != nil {
		t.Fatalf("reading card: %v", err)
	}
	if got.CardSchedule.Stage != 4 {
		t.Errorf("stage = %d, want 4 — editing card text must not reset the schedule", got.CardSchedule.Stage)
	}
	if store.FromTimePtr(got.CardSchedule.NextReviewDate) != "2026-09-01" {
		t.Errorf("next_review_date = %v, want 2026-09-01", store.FromTimePtr(got.CardSchedule.NextReviewDate))
	}
	if got.Card.Front != "Apa itu prior (probabilitas)?" {
		t.Errorf("front was not updated: %q", got.Card.Front)
	}
}

// TestSoftDeleteRestoresHistory: removing a card line and putting it back must
// return its review history, not start it over.
func TestSoftDeleteRestoresHistory(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	note, _ := st.Q().CreateNote(ctx, gen.CreateNoteParams{UserID: user.ID, Title: "n", ContentMd: "x"})
	const cardID = "m2p1"

	if _, err := st.Q().UpsertCard(ctx, gen.UpsertCardParams{
		ID: cardID, NoteID: note.ID, UserID: user.ID, Type: "basic", Front: "q", Back: "a",
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	due, _ := store.ToTimePtr("2026-10-01")
	if _, err := st.Q().CreateSchedule(ctx, gen.CreateScheduleParams{
		NoteID: note.ID, CardID: cardID, UserID: user.ID,
		Stage: 5, NextReviewDate: due, State: "learning",
	}); err != nil {
		t.Fatalf("schedule: %v", err)
	}

	if err := st.Q().SoftDeleteCard(ctx, gen.SoftDeleteCardParams{
		NoteID: note.ID, ID: cardID, UserID: user.ID,
	}); err != nil {
		t.Fatalf("soft delete: %v", err)
	}

	live, _ := st.Q().ListCardsByNote(ctx, gen.ListCardsByNoteParams{NoteID: note.ID, UserID: user.ID})
	if len(live) != 0 {
		t.Fatalf("got %d live cards after soft delete, want 0", len(live))
	}

	// The user undoes the deletion and saves again.
	if _, err := st.Q().UpsertCard(ctx, gen.UpsertCardParams{
		ID: cardID, NoteID: note.ID, UserID: user.ID, Type: "basic", Front: "q", Back: "a",
	}); err != nil {
		t.Fatalf("re-upsert: %v", err)
	}

	got, err := st.Q().GetCardWithSchedule(ctx, gen.GetCardWithScheduleParams{
		NoteID: note.ID, ID: cardID, UserID: user.ID,
	})
	if err != nil {
		t.Fatalf("reading restored card: %v", err)
	}
	if got.CardSchedule.Stage != 5 {
		t.Errorf("stage = %d, want 5 — restoring a card must restore its history", got.CardSchedule.Stage)
	}
}

// TestWithTxRollsBack: a failure mid-sync must leave nothing behind.
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

// TestDueCardsExcludeMastered: a mastered card has a NULL next_review_date.
// With emit_pointers_for_null_types off, that would decode as the zero date
// and every mastered card would jump to the front of the due list.
func TestDueCardsExcludeMastered(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	note, _ := st.Q().CreateNote(ctx, gen.CreateNoteParams{UserID: user.ID, Title: "n", ContentMd: "x"})

	add := func(id, state string, due *time.Time) {
		t.Helper()
		if _, err := st.Q().UpsertCard(ctx, gen.UpsertCardParams{
			ID: id, NoteID: note.ID, UserID: user.ID, Type: "basic", Front: "q", Back: "a",
		}); err != nil {
			t.Fatalf("upsert %s: %v", id, err)
		}
		if _, err := st.Q().CreateSchedule(ctx, gen.CreateScheduleParams{
			NoteID: note.ID, CardID: id, UserID: user.ID,
			Stage: 0, NextReviewDate: due, State: state,
		}); err != nil {
			t.Fatalf("schedule %s: %v", id, err)
		}
	}

	overdue, _ := store.ToTimePtr("2026-07-01")
	future, _ := store.ToTimePtr("2099-01-01")
	add("aaaa", "learning", overdue)
	add("bbbb", "learning", future)
	add("cccc", "mastered", nil)

	today, _ := store.ToTime("2026-08-05")
	rows, err := st.Q().ListDueCards(ctx, gen.ListDueCardsParams{
		UserID: user.ID, Today: today, Limit: 10,
	})
	if err != nil {
		t.Fatalf("listing due: %v", err)
	}

	if len(rows) != 1 {
		var ids []string
		for _, r := range rows {
			ids = append(ids, r.ID)
		}
		t.Fatalf("due = %v, want only the overdue learning card", ids)
	}
	if rows[0].ID != "aaaa" {
		t.Errorf("due card = %q, want aaaa", rows[0].ID)
	}
}
