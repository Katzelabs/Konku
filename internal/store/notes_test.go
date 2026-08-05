package store_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// today is fixed so the assertions about due dates are not a clock race.
const today = "2026-08-05"

// TestSaveCreatesCardsAndSchedules: a note containing `Q :: A` produces a card
// row scheduled for tomorrow, and the *stored* markdown carries the ID the
// parser assigned — without it the editor would send the same markdown back
// and create a duplicate card on every save.
func TestSaveCreatesCardsAndSchedules(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	saved, err := st.CreateNoteWithCards(ctx, user.ID, store.NoteInput{
		Title:     "Teorema Bayes",
		ContentMd: "# Teorema Bayes\n\nApa itu prior? :: Keyakinan awal\n",
	}, today)
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}

	if len(saved.Cards) != 1 {
		t.Fatalf("got %d cards, want 1", len(saved.Cards))
	}
	id := saved.Cards[0].ID
	if !strings.Contains(saved.Note.ContentMd, "<!-- c:"+id+" -->") {
		t.Fatalf("stored markdown carries no ID for the card: %q", saved.Note.ContentMd)
	}

	got, err := st.Q().GetCardWithSchedule(ctx, gen.GetCardWithScheduleParams{
		NoteID: saved.Note.ID, ID: id, UserID: user.ID,
	})
	if err != nil {
		t.Fatalf("reading card: %v", err)
	}
	if got.Card.Front != "Apa itu prior?" || got.Card.Back != "Keyakinan awal" {
		t.Errorf("card = %q / %q, want the parsed front and back", got.Card.Front, got.Card.Back)
	}
	if got.CardSchedule.Stage != 0 {
		t.Errorf("stage = %d, want 0", got.CardSchedule.Stage)
	}
	if d := store.FromTimePtr(got.CardSchedule.NextReviewDate); d != "2026-08-06" {
		t.Errorf("next_review_date = %q, want 2026-08-06 (tomorrow)", d)
	}
}

// TestScheduleSurvivesTextEditThroughSync is the acceptance criterion for C3
// and the reason cards are matched by ID. Editing the words either side of the
// separator must leave the schedule completely alone (D-019).
func TestScheduleSurvivesTextEditThroughSync(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	saved, err := st.CreateNoteWithCards(ctx, user.ID, store.NoteInput{
		Title:     "n",
		ContentMd: "Apa itu prior? :: Keyakinan awal\n",
	}, today)
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}
	id := saved.Cards[0].ID

	// Pretend the card has been reviewed for a few months.
	due, _ := store.ToTimePtr("2026-09-01")
	if _, err := st.Q().UpdateSchedule(ctx, gen.UpdateScheduleParams{
		NoteID: saved.Note.ID, CardID: id, UserID: user.ID,
		Stage: 4, NextReviewDate: due, Lapses: 2, State: "learning",
	}); err != nil {
		t.Fatalf("seeding schedule: %v", err)
	}

	// The user fixes a typo. The ID travels with the line, so this is one edit
	// of one card, not a delete plus an insert.
	edited := strings.Replace(saved.Note.ContentMd,
		"Apa itu prior? :: Keyakinan awal",
		"Apa itu prior (probabilitas)? :: Keyakinan awal sebelum melihat data", 1)

	after, err := st.UpdateNoteWithCards(ctx, user.ID, saved.Note.ID, store.NoteInput{
		Title:     "n",
		ContentMd: edited,
	}, today)
	if err != nil {
		t.Fatalf("updating note: %v", err)
	}
	if len(after.Cards) != 1 || after.Cards[0].ID != id {
		t.Fatalf("card ID changed across an edit: %+v, want %q", after.Cards, id)
	}

	got, err := st.Q().GetCardWithSchedule(ctx, gen.GetCardWithScheduleParams{
		NoteID: saved.Note.ID, ID: id, UserID: user.ID,
	})
	if err != nil {
		t.Fatalf("reading card: %v", err)
	}
	if got.Card.Front != "Apa itu prior (probabilitas)?" {
		t.Errorf("front = %q, want the edited text", got.Card.Front)
	}
	if got.CardSchedule.Stage != 4 {
		t.Errorf("stage = %d, want 4 — editing a card's text must not reset it", got.CardSchedule.Stage)
	}
	if got.CardSchedule.Lapses != 2 {
		t.Errorf("lapses = %d, want 2", got.CardSchedule.Lapses)
	}
	if d := store.FromTimePtr(got.CardSchedule.NextReviewDate); d != "2026-09-01" {
		t.Errorf("next_review_date = %q, want 2026-09-01", d)
	}
}

// TestRemovedCardIsSoftDeletedAndRestorable: deleting a line and saving must
// not vaporise the card's history, and putting the line back must return it.
func TestRemovedCardIsSoftDeletedAndRestorable(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	saved, err := st.CreateNoteWithCards(ctx, user.ID, store.NoteInput{
		Title:     "n",
		ContentMd: "q1 :: a1\nq2 :: a2\n",
	}, today)
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}
	if len(saved.Cards) != 2 {
		t.Fatalf("got %d cards, want 2", len(saved.Cards))
	}
	withBoth := saved.Note.ContentMd
	doomed := saved.Cards[1].ID

	due, _ := store.ToTimePtr("2026-10-01")
	if _, err := st.Q().UpdateSchedule(ctx, gen.UpdateScheduleParams{
		NoteID: saved.Note.ID, CardID: doomed, UserID: user.ID,
		Stage: 5, NextReviewDate: due, Lapses: 3, State: "learning",
	}); err != nil {
		t.Fatalf("seeding schedule: %v", err)
	}

	// The user deletes the second line.
	lines := strings.SplitN(withBoth, "\n", 2)
	if _, err := st.UpdateNoteWithCards(ctx, user.ID, saved.Note.ID, store.NoteInput{
		Title: "n", ContentMd: lines[0] + "\n",
	}, today); err != nil {
		t.Fatalf("updating note: %v", err)
	}

	live, err := st.Q().ListCardsByNote(ctx, gen.ListCardsByNoteParams{
		NoteID: saved.Note.ID, UserID: user.ID,
	})
	if err != nil {
		t.Fatalf("listing cards: %v", err)
	}
	if len(live) != 1 || live[0].ID == doomed {
		t.Fatalf("got %d live cards, want only the surviving one", len(live))
	}

	// The removal is soft: the row is still there with deleted_at set.
	var deleted *string
	if err := st.Pool().QueryRow(ctx,
		"SELECT deleted_at::text FROM cards WHERE note_id = $1 AND id = $2",
		saved.Note.ID, doomed).Scan(&deleted); err != nil {
		t.Fatalf("the removed card was hard-deleted: %v", err)
	}
	if deleted == nil {
		t.Fatal("deleted_at is null on a card removed from the markdown")
	}

	// The user undoes the deletion.
	restored, err := st.UpdateNoteWithCards(ctx, user.ID, saved.Note.ID, store.NoteInput{
		Title: "n", ContentMd: withBoth,
	}, today)
	if err != nil {
		t.Fatalf("restoring note: %v", err)
	}
	if len(restored.Cards) != 2 {
		t.Fatalf("got %d cards after restoring, want 2", len(restored.Cards))
	}

	got, err := st.Q().GetCardWithSchedule(ctx, gen.GetCardWithScheduleParams{
		NoteID: saved.Note.ID, ID: doomed, UserID: user.ID,
	})
	if err != nil {
		t.Fatalf("reading the restored card: %v", err)
	}
	if got.CardSchedule.Stage != 5 || got.CardSchedule.Lapses != 3 {
		t.Errorf("stage/lapses = %d/%d, want 5/3 — an undone deletion must return the history",
			got.CardSchedule.Stage, got.CardSchedule.Lapses)
	}
	if d := store.FromTimePtr(got.CardSchedule.NextReviewDate); d != "2026-10-01" {
		t.Errorf("next_review_date = %q, want 2026-10-01", d)
	}
}

// TestSaveIsIdempotent: saving the returned markdown unchanged must not create
// a second copy of every card. The editor does exactly this on every keystroke
// pause, so a Parse that reassigned IDs would multiply cards without bound.
func TestSaveIsIdempotent(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	saved, err := st.CreateNoteWithCards(ctx, user.ID, store.NoteInput{
		Title: "n", ContentMd: "q1 :: a1\nq2 :: a2\n",
	}, today)
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}

	again, err := st.UpdateNoteWithCards(ctx, user.ID, saved.Note.ID, store.NoteInput{
		Title: "n", ContentMd: saved.Note.ContentMd,
	}, today)
	if err != nil {
		t.Fatalf("re-saving: %v", err)
	}
	if again.Note.ContentMd != saved.Note.ContentMd {
		t.Errorf("markdown changed on a no-op save:\n got %q\nwant %q", again.Note.ContentMd, saved.Note.ContentMd)
	}

	live, err := st.Q().ListCardsByNote(ctx, gen.ListCardsByNoteParams{
		NoteID: saved.Note.ID, UserID: user.ID,
	})
	if err != nil {
		t.Fatalf("listing cards: %v", err)
	}
	if len(live) != 2 {
		t.Fatalf("got %d cards after a no-op save, want 2", len(live))
	}
}

// TestSyncCommitsWithTheNote: the note update and the card writes are one
// transaction. If they were not, a note could be stored whose markdown
// disagrees with its cards, with nothing to detect it.
func TestSyncCommitsWithTheNote(t *testing.T) {
	st, ctx := newStore(t)
	alice := newUser(t, st, ctx)
	bob := newUser(t, st, ctx)

	saved, err := st.CreateNoteWithCards(ctx, alice.ID, store.NoteInput{
		Title: "n", ContentMd: "q1 :: a1\n",
	}, today)
	if err != nil {
		t.Fatalf("creating note: %v", err)
	}

	// Bob's write is rejected at the note row, before any card is touched.
	_, err = st.UpdateNoteWithCards(ctx, bob.ID, saved.Note.ID, store.NoteInput{
		Title: "hijacked", ContentMd: "hijacked :: hijacked\n",
	}, today)
	if !errors.Is(err, store.ErrNoteNotFound) {
		t.Fatalf("got %v, want ErrNoteNotFound — a wrong owner must look like a missing note", err)
	}

	note, err := st.Q().GetNote(ctx, gen.GetNoteParams{ID: saved.Note.ID, UserID: alice.ID})
	if err != nil {
		t.Fatalf("re-reading note: %v", err)
	}
	if note.ContentMd != saved.Note.ContentMd {
		t.Errorf("the note was modified: %q", note.ContentMd)
	}

	live, err := st.Q().ListCardsByNote(ctx, gen.ListCardsByNoteParams{
		NoteID: saved.Note.ID, UserID: alice.ID,
	})
	if err != nil {
		t.Fatalf("listing cards: %v", err)
	}
	if len(live) != 1 || live[0].Front != "q1" {
		t.Fatalf("alice's cards were touched by bob's rejected write: %+v", live)
	}
}

// TestUpdateMissingNote: a note that does not exist is the same answer as one
// owned by somebody else.
func TestUpdateMissingNote(t *testing.T) {
	st, ctx := newStore(t)
	user := newUser(t, st, ctx)

	_, err := st.UpdateNoteWithCards(ctx, user.ID, uuid.New(), store.NoteInput{
		Title: "n", ContentMd: "q :: a\n",
	}, today)
	if !errors.Is(err, store.ErrNoteNotFound) {
		t.Fatalf("got %v, want ErrNoteNotFound", err)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		t.Error("pgx.ErrNoRows leaked past the store boundary")
	}
}
