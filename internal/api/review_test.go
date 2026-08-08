package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/srs"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

type dueBody struct {
	Cards []struct {
		ID    string `json:"id"`
		Type  string `json:"type"`
		Front string `json:"front"`
	} `json:"cards"`
	Total int64 `json:"total"`
}

// makeDue backdates a card's schedule so it is due today. New cards are due
// tomorrow, and a test that waited a day would not be a test.
func makeDue(t *testing.T, c *testClient, cardID string, stage int32, lapses int32) {
	t.Helper()
	id, err := uuid.Parse(cardID)
	if err != nil {
		t.Fatalf("card id %q: %v", cardID, err)
	}
	due, err := store.ToTimePtr(srs.Today(time.Now()))
	if err != nil {
		t.Fatalf("date: %v", err)
	}
	if _, err := c.app.store.Q().UpdateSchedule(c.app.ctx, gen.UpdateScheduleParams{
		CardID: id, UserID: c.userID,
		Stage: stage, NextReviewDate: due, Lapses: lapses, State: "learning",
	}); err != nil {
		t.Fatalf("backdating schedule: %v", err)
	}
}

func scheduleOf(t *testing.T, c *testClient, cardID string) gen.CardSchedule {
	t.Helper()
	id, err := uuid.Parse(cardID)
	if err != nil {
		t.Fatalf("card id %q: %v", cardID, err)
	}
	row, err := c.app.store.Q().GetCardWithSchedule(c.app.ctx, gen.GetCardWithScheduleParams{
		ID: id, UserID: c.userID,
	})
	if err != nil {
		t.Fatalf("reading schedule for %q: %v", cardID, err)
	}
	return row.CardSchedule
}

// oneDueCard is the common setup: a single card, due today.
func oneDueCard(t *testing.T, c *testClient, front, back string) string {
	t.Helper()
	card := c.createCard(map[string]any{"front": front, "back": back})
	makeDue(t, c, card.ID, 0, 0)
	return card.ID
}

// TestDueListWithholdsTheAnswer is the D-003 guarantee at the wire level. If
// the answer travels with the prompt, recall-before-reveal is defeated by a
// glance at dev-tools — and the whole product rests on that mechanism.
func TestDueListWithholdsTheAnswer(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	const answer = "Keyakinan awal sebelum melihat data"
	cardID := oneDueCard(t, c, "Apa itu prior?", answer)

	var due dueBody
	raw := c.expect(c.do(http.MethodGet, "/review/due", nil), http.StatusOK, &due)

	if len(due.Cards) != 1 {
		t.Fatalf("got %d due cards, want 1", len(due.Cards))
	}
	if due.Cards[0].Front != "Apa itu prior?" {
		t.Errorf("front = %q", due.Cards[0].Front)
	}
	if strings.Contains(raw, answer) {
		t.Fatalf("the due list shipped the answer: %s", raw)
	}
	if strings.Contains(raw, `"back"`) {
		t.Fatalf("the due list has a back field: %s", raw)
	}

	// The answer arrives only when asked for, as its own request.
	var ans struct {
		Back string `json:"back"`
	}
	c.expect(c.do(http.MethodGet, "/review/"+cardID+"/answer", nil), http.StatusOK, &ans)
	if ans.Back != answer {
		t.Errorf("back = %q, want %q", ans.Back, answer)
	}
}

// TestRateLupa is A2's acceptance criterion: back to stage 0, due tomorrow,
// one more lapse, and a log row written.
func TestRateLupa(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	cardID := c.createCard(map[string]any{"front": "q", "back": "a"}).ID
	makeDue(t, c, cardID, 4, 1)

	var rated struct {
		Stage          int32   `json:"stage"`
		State          string  `json:"state"`
		NextReviewDate *string `json:"nextReviewDate"`
	}
	c.expect(c.do(http.MethodPost, "/review/"+cardID, map[string]any{
		"rating": "lupa",
	}), http.StatusOK, &rated)

	tomorrow := string(srs.Today(time.Now()).AddDays(1))
	if rated.Stage != 0 {
		t.Errorf("stage = %d, want 0", rated.Stage)
	}
	if rated.NextReviewDate == nil || *rated.NextReviewDate != tomorrow {
		t.Errorf("nextReviewDate = %v, want %q", rated.NextReviewDate, tomorrow)
	}

	sched := scheduleOf(t, c, cardID)
	if sched.Stage != 0 {
		t.Errorf("stored stage = %d, want 0", sched.Stage)
	}
	if sched.Lapses != 2 {
		t.Errorf("lapses = %d, want 2", sched.Lapses)
	}
	if got := store.FromTimePtr(sched.NextReviewDate); string(got) != tomorrow {
		t.Errorf("stored next_review_date = %q, want %q", got, tomorrow)
	}

	// The log row is not optional. Retention cannot be reconstructed after the
	// fact, which is why this table exists before the feature that reads it.
	var rating string
	var before, after int32
	if err := c.app.store.Pool().QueryRow(c.app.ctx,
		`SELECT rating, interval_before, interval_after FROM review_logs
		  WHERE card_id = $1 AND user_id = $2`,
		cardID, c.userID).Scan(&rating, &before, &after); err != nil {
		t.Fatalf("no review log was written: %v", err)
	}
	if rating != "lupa" {
		t.Errorf("logged rating = %q, want lupa", rating)
	}
	if before != int32(srs.Intervals[4]) {
		t.Errorf("interval_before = %d, want %d", before, srs.Intervals[4])
	}
	if after != int32(srs.Intervals[0]) {
		t.Errorf("interval_after = %d, want %d", after, srs.Intervals[0])
	}
}

func TestRateIngatAdvances(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	cardID := c.createCard(map[string]any{"front": "q", "back": "a"}).ID
	makeDue(t, c, cardID, 0, 0)

	var rated struct {
		Stage          int32   `json:"stage"`
		State          string  `json:"state"`
		NextReviewDate *string `json:"nextReviewDate"`
	}
	c.expect(c.do(http.MethodPost, "/review/"+cardID, map[string]any{
		"rating": "ingat",
	}), http.StatusOK, &rated)

	want := string(srs.Today(time.Now()).AddDays(srs.Intervals[1]))
	if rated.Stage != 1 {
		t.Errorf("stage = %d, want 1", rated.Stage)
	}
	if rated.NextReviewDate == nil || *rated.NextReviewDate != want {
		t.Errorf("nextReviewDate = %v, want %q", rated.NextReviewDate, want)
	}

	// And it is no longer due today.
	var due dueBody
	c.expect(c.do(http.MethodGet, "/review/due", nil), http.StatusOK, &due)
	for _, card := range due.Cards {
		if card.ID == cardID {
			t.Error("a card rated ingat is still due today")
		}
	}
}

// TestMasteringClearsTheDueDate: clearing the top rung retires the card rather
// than looping it forever (D-008).
func TestMasteringClearsTheDueDate(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	cardID := c.createCard(map[string]any{"front": "q", "back": "a"}).ID
	makeDue(t, c, cardID, int32(len(srs.Intervals)-1), 0)

	var rated struct {
		State          string  `json:"state"`
		NextReviewDate *string `json:"nextReviewDate"`
	}
	c.expect(c.do(http.MethodPost, "/review/"+cardID, map[string]any{
		"rating": "ingat",
	}), http.StatusOK, &rated)

	if rated.State != string(srs.StateMastered) {
		t.Errorf("state = %q, want mastered", rated.State)
	}
	if rated.NextReviewDate != nil {
		t.Errorf("nextReviewDate = %v, want null — a mastered card is not scheduled", *rated.NextReviewDate)
	}
	if s := scheduleOf(t, c, cardID); s.NextReviewDate != nil {
		t.Error("the stored next_review_date is not null for a mastered card")
	}
}

// TestDueTotalReportsWhatTheCapDeferred, so the UI can say "sisanya besok"
// plainly instead of pretending the day is over (D-009).
func TestDueTotalReportsWhatTheCapDeferred(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	for i := 0; i < 5; i++ {
		card := c.createCard(map[string]any{
			"front": "q" + string(rune('a'+i)), "back": "jawaban",
		})
		makeDue(t, c, card.ID, 0, 0)
	}

	var due dueBody
	c.expect(c.do(http.MethodGet, "/review/due?limit=2", nil), http.StatusOK, &due)

	if len(due.Cards) != 2 {
		t.Fatalf("got %d cards, want the cap of 2", len(due.Cards))
	}
	if due.Total != 5 {
		t.Errorf("total = %d, want 5 — the UI needs the real number to say what is deferred", due.Total)
	}
}

func TestReviewOwnershipAndValidation(t *testing.T) {
	app := newApp(t)
	alice := app.newClient(t)
	bob := app.newClient(t)

	cardID := oneDueCard(t, alice, "rahasia", "jawaban rahasia")

	t.Run("another user cannot read the answer", func(t *testing.T) {
		res := bob.do(http.MethodGet, "/review/"+cardID+"/answer", nil)
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", res.StatusCode)
		}
	})

	t.Run("another user cannot rate the card", func(t *testing.T) {
		res := bob.do(http.MethodPost, "/review/"+cardID, map[string]any{"rating": "ingat"})
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", res.StatusCode)
		}
		// And alice's schedule is untouched.
		if s := scheduleOf(t, alice, cardID); s.Stage != 0 {
			t.Errorf("stage = %d, want 0 — a rejected rating moved the schedule", s.Stage)
		}
	})

	t.Run("bob's card list is empty", func(t *testing.T) {
		var due dueBody
		bob.expect(bob.do(http.MethodGet, "/review/due", nil), http.StatusOK, &due)
		if len(due.Cards) != 0 || due.Total != 0 {
			t.Errorf("alice's cards leaked into bob's due list: %+v", due)
		}
	})

	t.Run("an unknown rating is a 400", func(t *testing.T) {
		res := alice.do(http.MethodPost, "/review/"+cardID, map[string]any{"rating": "mungkin"})
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", res.StatusCode)
		}
	})

	t.Run("a card that does not exist is a 404", func(t *testing.T) {
		res := alice.do(http.MethodGet, "/review/"+uuid.NewString()+"/answer", nil)
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", res.StatusCode)
		}
	})
}
