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

// cardsOf reads a note's live cards straight from the store. The API does not
// expose them — they are an effect of saving markdown, not a resource — so
// this is how the tests check that the effect happened.
func cardsOf(t *testing.T, c *testClient, noteID string) []gen.Card {
	t.Helper()
	id, err := uuid.Parse(noteID)
	if err != nil {
		t.Fatalf("note id %q: %v", noteID, err)
	}
	cards, err := c.app.store.Q().ListCardsByNote(c.app.ctx, gen.ListCardsByNoteParams{
		NoteID: id, UserID: c.userID,
	})
	if err != nil {
		t.Fatalf("listing cards: %v", err)
	}
	return cards
}

func scheduleOf(t *testing.T, c *testClient, noteID, cardID string) gen.CardSchedule {
	t.Helper()
	id, _ := uuid.Parse(noteID)
	row, err := c.app.store.Q().GetCardWithSchedule(c.app.ctx, gen.GetCardWithScheduleParams{
		NoteID: id, ID: cardID, UserID: c.userID,
	})
	if err != nil {
		t.Fatalf("reading schedule for %q: %v", cardID, err)
	}
	return row.CardSchedule
}

// TestCreateNoteSyncsCards is A1's acceptance criterion: a note containing
// `Q :: A` produces a card row with a schedule due tomorrow.
func TestCreateNoteSyncsCards(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	note := c.createNote(map[string]any{
		"title":     "Teorema Bayes",
		"contentMd": "# Teorema Bayes\n\nApa itu prior? :: Keyakinan awal\n",
	})

	if !strings.Contains(note.ContentMd, "<!-- c:") {
		t.Fatalf("the response markdown carries no card ID: %q", note.ContentMd)
	}

	cards := cardsOf(t, c, note.ID)
	if len(cards) != 1 {
		t.Fatalf("got %d cards, want 1", len(cards))
	}
	if cards[0].Front != "Apa itu prior?" || cards[0].Back != "Keyakinan awal" {
		t.Errorf("card = %q / %q", cards[0].Front, cards[0].Back)
	}

	sched := scheduleOf(t, c, note.ID, cards[0].ID)
	tomorrow := srs.Today(time.Now()).AddDays(1)
	if got := store.FromTimePtr(sched.NextReviewDate); got != tomorrow {
		t.Errorf("next_review_date = %q, want %q (tomorrow)", got, tomorrow)
	}
	if sched.Stage != 0 || sched.State != "learning" {
		t.Errorf("stage/state = %d/%q, want 0/learning", sched.Stage, sched.State)
	}
}

// TestPatchReturnsStoredMarkdown: the editor replaces its buffer with the
// response, and sending that back must be a no-op. If PATCH returned the
// submitted markdown instead, every autosave would look like a fresh set of
// cards and multiply them without bound.
func TestPatchReturnsStoredMarkdown(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	note := c.createNote(map[string]any{"title": "n", "contentMd": "q1 :: a1\n"})

	var patched noteBody
	c.expect(c.do(http.MethodPatch, "/notes/"+note.ID, map[string]any{
		"contentMd": note.ContentMd + "q2 :: a2\n",
	}), http.StatusOK, &patched)

	if strings.Count(patched.ContentMd, "<!-- c:") != 2 {
		t.Fatalf("want two card IDs in the stored markdown, got %q", patched.ContentMd)
	}
	if len(cardsOf(t, c, note.ID)) != 2 {
		t.Fatalf("got %d cards, want 2", len(cardsOf(t, c, note.ID)))
	}

	// Saving the response back unchanged, the way an autosave does.
	var again noteBody
	c.expect(c.do(http.MethodPatch, "/notes/"+note.ID, map[string]any{
		"contentMd": patched.ContentMd,
	}), http.StatusOK, &again)

	if again.ContentMd != patched.ContentMd {
		t.Errorf("a no-op save rewrote the markdown:\n got %q\nwant %q", again.ContentMd, patched.ContentMd)
	}
	if n := len(cardsOf(t, c, note.ID)); n != 2 {
		t.Errorf("got %d cards after a no-op save, want 2", n)
	}
}

// TestPatchIsPartial: the capture dialog sends only what it changed.
func TestPatchIsPartial(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	note := c.createNote(map[string]any{"title": "Judul asli", "contentMd": "isi\n"})

	var patched noteBody
	c.expect(c.do(http.MethodPatch, "/notes/"+note.ID, map[string]any{
		"contentMd": "isi baru\n",
	}), http.StatusOK, &patched)

	if patched.Title != "Judul asli" {
		t.Errorf("title = %q, want it left alone", patched.Title)
	}
	if patched.ContentMd != "isi baru\n" {
		t.Errorf("contentMd = %q", patched.ContentMd)
	}
}

// TestAnotherUsersNoteIsNotFound: never 403. A 403 would confirm the note
// exists and turn the API into a probe for other users' data (D-039).
func TestAnotherUsersNoteIsNotFound(t *testing.T) {
	app := newApp(t)
	alice := app.newClient(t)
	bob := app.newClient(t)

	note := alice.createNote(map[string]any{"title": "rahasia", "contentMd": "q :: a\n"})

	missing := uuid.NewString()

	for _, tc := range []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{"get another user's note", http.MethodGet, "/notes/" + note.ID, nil},
		{"patch another user's note", http.MethodPatch, "/notes/" + note.ID, map[string]any{"title": "dibajak"}},
		{"get a note that does not exist", http.MethodGet, "/notes/" + missing, nil},
		{"a malformed id", http.MethodGet, "/notes/not-a-uuid", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := bob.do(tc.method, tc.path, tc.body)
			if res.StatusCode != http.StatusNotFound {
				t.Fatalf("status = %d, want 404", res.StatusCode)
			}
		})
	}

	// And the rejected patch really did nothing.
	var after noteBody
	alice.expect(alice.do(http.MethodGet, "/notes/"+note.ID, nil), http.StatusOK, &after)
	if after.Title != "rahasia" {
		t.Errorf("title = %q, want unchanged", after.Title)
	}
}

// TestNoteListIsNewestFirst, with the card count the list screen shows.
func TestNoteListIsNewestFirst(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	first := c.createNote(map[string]any{"title": "pertama", "contentMd": "q1 :: a1\nq2 :: a2\n"})
	second := c.createNote(map[string]any{"title": "kedua", "contentMd": "tanpa kartu\n"})

	var list []struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		CardCount int64  `json:"cardCount"`
		ContentMd string `json:"contentMd"`
	}
	raw := c.expect(c.do(http.MethodGet, "/notes", nil), http.StatusOK, &list)

	if len(list) != 2 {
		t.Fatalf("got %d notes, want 2", len(list))
	}
	if list[0].ID != second.ID || list[1].ID != first.ID {
		t.Errorf("order = %q, %q; want newest first", list[0].Title, list[1].Title)
	}
	if list[1].CardCount != 2 {
		t.Errorf("cardCount = %d, want 2", list[1].CardCount)
	}
	if strings.Contains(raw, "contentMd") {
		t.Error("the list ships full note markdown; it only needs titles and counts")
	}
}

// TestTitleIsDerivedWhenAbsent protects capture cost: the capture dialog (A7)
// is one field and no title, and being made to name a thought before writing
// it down is exactly the friction this product exists to remove.
func TestTitleIsDerivedWhenAbsent(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{"a heading", "# Teorema Bayes\n\nisi\n", "Teorema Bayes"},
		{"plain prose", "belajar regresi linear hari ini\n", "belajar regresi linear hari ini"},
		{"a card line uses its front", "Apa itu prior? :: Keyakinan awal\n", "Apa itu prior?"},
		{"leading blank lines are skipped", "\n\n  catatan singkat\n", "catatan singkat"},
		{"nothing at all", "", "Tanpa judul"},
	}

	app := newApp(t)
	c := app.newClient(t)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			note := c.createNote(map[string]any{"contentMd": tt.content})
			if note.Title != tt.want {
				t.Errorf("title = %q, want %q", note.Title, tt.want)
			}
		})
	}
}

func TestNoteValidation(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	t.Run("an unknown domain is a 400, not a 500", func(t *testing.T) {
		res := c.do(http.MethodPost, "/notes", map[string]any{
			"title": "n", "contentMd": "isi", "domainId": "astrologi",
		})
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", res.StatusCode)
		}
	})

	t.Run("a known domain is accepted", func(t *testing.T) {
		note := c.createNote(map[string]any{
			"title": "n", "contentMd": "isi", "domainId": "math",
		})
		if note.DomainID == nil || *note.DomainID != "math" {
			t.Errorf("domainId = %v, want math", note.DomainID)
		}
	})

	t.Run("an overlong title is a 400", func(t *testing.T) {
		res := c.do(http.MethodPost, "/notes", map[string]any{
			"title": strings.Repeat("a", 201), "contentMd": "isi",
		})
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", res.StatusCode)
		}
	})
}
