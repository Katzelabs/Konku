package api_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// Export (07 L6).
//
// L6's acceptance is "the archive contains every row the account owns". The
// test below states that literally: it counts the rows in the database, counts
// the entries in the archive, and requires the two to match — so a table added
// later and forgotten in the export fails here rather than being discovered by
// somebody who has already deleted their account.

// downloadExport fetches the archive and returns its files by name.
func downloadExport(t *testing.T, c *testClient) map[string][]byte {
	t.Helper()

	res := c.do(http.MethodGet, "/export", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET /export = %d, want 200", res.StatusCode)
	}
	if ct := res.Header.Get("Content-Type"); ct != "application/zip" {
		t.Errorf("Content-Type = %q, want application/zip", ct)
	}
	if cd := res.Header.Get("Content-Disposition"); !strings.Contains(cd, "konku-export-") {
		t.Errorf("Content-Disposition = %q, want a dated filename", cd)
	}

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("reading the archive: %v", err)
	}
	r, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("the response is not a valid zip: %v", err)
	}

	out := map[string][]byte{}
	for _, f := range r.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("opening %s: %v", f.Name, err)
		}
		body, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatalf("reading %s: %v", f.Name, err)
		}
		out[f.Name] = body
	}
	return out
}

// seedEverything gives an account at least one row in every table the export
// covers, so a missing table shows up as a count mismatch rather than as two
// zeroes agreeing with each other.
func seedEverything(t *testing.T, c *testClient) {
	t.Helper()

	domain := c.domainID("math")
	category := c.createCategory("Aljabar")

	c.createNote(map[string]any{
		"title":       "Bab 3: \"Ingatan\"",
		"contentMd":   "Isi catatan.",
		"domainId":    domain,
		"categoryIds": []string{category.ID},
	})

	// A second note, deleted, because a soft-deleted row is still owned.
	gone := c.createNote(map[string]any{"title": "Catatan lama", "contentMd": "x"})
	c.expect(c.do(http.MethodDelete, "/notes/"+gone.ID, nil), http.StatusNoContent, nil)

	card := c.createCard(map[string]any{
		"front":       "Apa itu integral?",
		"back":        "Kebalikan turunan.",
		"domainId":    domain,
		"categoryIds": []string{category.ID},
	})

	// Rating a card writes both a schedule and a review log — the two rows
	// that cannot be reconstructed from the notes (D-029).
	c.expect(c.do(http.MethodPost, "/review/due/"+card.ID, map[string]any{"rating": "ingat"}),
		http.StatusOK, nil)

	c.expect(c.do(http.MethodPost, "/sessions", map[string]any{
		"domainId":        domain,
		"durationMinutes": 25,
		"sessionDate":     today(),
	}), http.StatusCreated, nil)

	// A set with both kinds of filter attached, so the export has to carry the
	// join tables and not just the set row.
	set := c.createSet(map[string]any{
		"title":       "Ulangan aljabar",
		"selection":   "fixed",
		"domainIds":   []string{domain},
		"categoryIds": []string{category.ID},
	})
	c.expect(c.do(http.MethodPut, "/review/sets/"+set.ID+"/cards", map[string]any{
		"cards": []map[string]any{{"cardId": card.ID}},
	}), http.StatusNoContent, nil)
	c.startRun(set.ID, http.StatusCreated)
}

// The acceptance criterion, stated as a comparison against the database.
func TestExportContainsEveryRowTheAccountOwns(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)
	seedEverything(t, c)

	files := downloadExport(t, c)

	// table -> the JSON file it lands in. auth_sessions and auth_tokens are
	// deliberately absent: a session id is a live credential and a token hash
	// is the shadow of one, and neither is content the user wrote.
	tables := map[string]string{
		"domains":            "data/domains.json",
		"categories":         "data/categories.json",
		"notes":              "data/notes.json",
		"note_categories":    "data/note-categories.json",
		"cards":              "data/cards.json",
		"card_categories":    "data/card-categories.json",
		"card_schedules":     "data/schedules.json",
		"review_logs":        "data/reviews.json",
		"focus_sessions":     "data/focus-sessions.json",
		"review_sets":           "data/review-sets.json",
		"review_set_domains":    "data/review-set-domains.json",
		"review_set_categories": "data/review-set-categories.json",
		"review_set_cards":      "data/review-set-cards.json",
		"review_runs":           "data/review-runs.json",
		"review_run_cards":      "data/review-run-cards.json",
	}

	for table, file := range tables {
		t.Run(table, func(t *testing.T) {
			var inDB int
			if err := c.scanAs("SELECT count(*) FROM "+table+" WHERE user_id = $1",
				[]any{c.userID}, &inDB); err != nil {
				t.Fatalf("counting %s: %v", table, err)
			}
			if inDB == 0 {
				t.Fatalf("no rows in %s — the seed does not cover this table, so "+
					"the comparison below would pass without proving anything", table)
			}

			body, ok := files[file]
			if !ok {
				t.Fatalf("%s is missing from the archive", file)
			}
			var rows []json.RawMessage
			if err := json.Unmarshal(body, &rows); err != nil {
				t.Fatalf("decoding %s: %v", file, err)
			}
			if len(rows) != inDB {
				t.Errorf("%s has %d row(s) in the database and %d in %s",
					table, inDB, len(rows), file)
			}
		})
	}
}

// Notes and cards leave as markdown, one file each, including the deleted ones.
func TestExportWritesNotesAndCardsAsMarkdown(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)
	seedEverything(t, c)

	files := downloadExport(t, c)

	var liveNotes, deletedNotes, cards int
	for name := range files {
		switch {
		case strings.HasPrefix(name, "notes/terhapus/"):
			deletedNotes++
		case strings.HasPrefix(name, "notes/"):
			liveNotes++
		case strings.HasPrefix(name, "cards/"):
			cards++
		}
	}

	if liveNotes != 1 {
		t.Errorf("%d live note files, want 1", liveNotes)
	}
	if deletedNotes != 1 {
		t.Errorf("%d deleted note files, want 1 — a soft-deleted note is still "+
			"the user's and must not vanish from their own export", deletedNotes)
	}
	if cards != 1 {
		t.Errorf("%d card files, want 1", cards)
	}

	if _, ok := files["README.md"]; !ok {
		t.Error("no README.md; an archive nobody can read is not an export")
	}
}

// The tenancy test. An export is the single largest read in the application,
// so scoping it wrongly leaks everything at once (D-039).
func TestExportIsScopedToTheAccount(t *testing.T) {
	a := newApp(t)
	alice := a.newClient(t)
	bob := a.newClient(t)

	alice.createNote(map[string]any{"title": "Rahasia Alice", "contentMd": "jangan bocor"})
	bob.createNote(map[string]any{"title": "Punya Bob", "contentMd": "milik bob"})

	files := downloadExport(t, bob)
	for name, body := range files {
		if bytes.Contains(body, []byte("Rahasia Alice")) || bytes.Contains(body, []byte("jangan bocor")) {
			t.Fatalf("bob's export contains alice's note, in %s", name)
		}
	}

	// And Bob's own note really is there, or the assertion above passes for
	// the wrong reason.
	var found bool
	for _, body := range files {
		if bytes.Contains(body, []byte("Punya Bob")) {
			found = true
		}
	}
	if !found {
		t.Error("bob's export does not contain bob's note")
	}
}

// The archive gets emailed around and dropped in cloud storage. It must never
// carry the password hash or a session credential.
func TestExportCarriesNoCredentials(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)
	seedEverything(t, c)

	files := downloadExport(t, c)
	for name, body := range files {
		for _, banned := range []string{"password_hash", "argon2", "token_hash", c.cookie.Value} {
			if bytes.Contains(body, []byte(banned)) {
				t.Errorf("%s contains a credential (%q)", name, banned)
			}
		}
	}
}
