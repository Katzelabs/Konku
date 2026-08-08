package api_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// These used to assert that saving a note produced card rows and schedules.
// D-055 removed the parser, so a note save is a note save; what is left to
// cover is the note itself and the category links that now commit with it.

// TestNoteMarkdownIsStoredVerbatim.
//
// The old contract was the opposite: the response carried the *stored*
// markdown, which differed from what was submitted because the parser wrote
// `<!-- c:xxxx -->` markers into new card lines, and the editor had to adopt
// it or every save would create fresh cards. Nothing rewrites a note now, and
// a regression that reintroduced rewriting would be silent in the editor.
func TestNoteMarkdownIsStoredVerbatim(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	const md = "Apa itu prior? :: Keyakinan awal\n\n```\nkode :: tetap\n```\n"

	note := c.createNote(map[string]any{"title": "n", "contentMd": md})
	if note.ContentMd != md {
		t.Errorf("contentMd = %q, want it stored byte for byte", note.ContentMd)
	}

	var fetched noteBody
	c.expect(c.do(http.MethodGet, "/notes/"+note.ID, nil), http.StatusOK, &fetched)
	if fetched.ContentMd != md {
		t.Errorf("contentMd on read = %q, want %q", fetched.ContentMd, md)
	}
}

// TestPatchIsPartial: the capture dialog sends only what it changed.
func TestPatchIsPartial(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	math := c.createCategory("Matematika")
	note := c.createNote(map[string]any{
		"title": "Judul asli", "contentMd": "isi\n",
		"categoryIds": []string{math.ID},
	})

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
	// Categories are replaced wholesale by the store, so a patch that does not
	// mention them has to carry the stored set forward. Getting this wrong
	// would silently strip every label on an ordinary autosave.
	if len(patched.CategoryIDs) != 1 || patched.CategoryIDs[0] != math.ID {
		t.Errorf("categoryIds = %v, want %v kept — an autosave wiped the labels", patched.CategoryIDs, math.ID)
	}
}

func TestNoteCategories(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	math := c.createCategory("Matematika")
	stats := c.createCategory("Statistik")

	note := c.createNote(map[string]any{
		"title": "n", "contentMd": "isi",
		"categoryIds": []string{math.ID, stats.ID},
	})
	if len(note.CategoryIDs) != 2 {
		t.Fatalf("categoryIds = %v, want 2", note.CategoryIDs)
	}

	t.Run("an explicit set replaces the old one", func(t *testing.T) {
		var patched noteBody
		c.expect(c.do(http.MethodPatch, "/notes/"+note.ID, map[string]any{
			"categoryIds": []string{stats.ID},
		}), http.StatusOK, &patched)

		if len(patched.CategoryIDs) != 1 || patched.CategoryIDs[0] != stats.ID {
			t.Errorf("categoryIds = %v, want only %v", patched.CategoryIDs, stats.ID)
		}
	})

	t.Run("an empty array clears them", func(t *testing.T) {
		var patched noteBody
		c.expect(c.do(http.MethodPatch, "/notes/"+note.ID, map[string]any{
			"categoryIds": []string{},
		}), http.StatusOK, &patched)

		if len(patched.CategoryIDs) != 0 {
			t.Errorf("categoryIds = %v, want none", patched.CategoryIDs)
		}
	})

	t.Run("an unknown category is a 400, not a 500", func(t *testing.T) {
		res := c.do(http.MethodPost, "/notes", map[string]any{
			"title": "n", "categoryIds": []string{uuid.NewString()},
		})
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", res.StatusCode)
		}
	})

	// Identical answer to an unknown category, so the endpoint cannot be used
	// to discover that someone else's category exists (D-039).
	t.Run("another user's category is a 400, not a 500", func(t *testing.T) {
		other := app.newClient(t)
		theirs := other.createCategory("Rahasia")

		res := c.do(http.MethodPost, "/notes", map[string]any{
			"title": "n", "categoryIds": []string{theirs.ID},
		})
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", res.StatusCode)
		}
	})
}

func TestNotesFilterByCategory(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	math := c.createCategory("Matematika")
	tagged := c.createNote(map[string]any{"title": "ditandai", "categoryIds": []string{math.ID}})
	c.createNote(map[string]any{"title": "tidak ditandai"})

	var list []noteBody
	c.expect(c.do(http.MethodGet, "/notes?categoryId="+math.ID, nil), http.StatusOK, &list)

	if len(list) != 1 || list[0].ID != tagged.ID {
		t.Fatalf("got %d notes, want only the tagged one", len(list))
	}

	t.Run("a malformed filter is a 400", func(t *testing.T) {
		// Ignoring it would return everything and read as "the filter matched
		// everything", which is worse than an error.
		res := c.do(http.MethodGet, "/notes?categoryId=not-a-uuid", nil)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", res.StatusCode)
		}
	})
}

// TestAnotherUsersNoteIsNotFound: never 403. A 403 would confirm the note
// exists and turn the API into a probe for other users' data (D-039).
func TestAnotherUsersNoteIsNotFound(t *testing.T) {
	app := newApp(t)
	alice := app.newClient(t)
	bob := app.newClient(t)

	note := alice.createNote(map[string]any{"title": "rahasia", "contentMd": "isi"})

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

func TestNoteListIsNewestFirst(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	first := c.createNote(map[string]any{"title": "pertama", "contentMd": "isi panjang"})
	second := c.createNote(map[string]any{"title": "kedua", "contentMd": "isi lain"})

	var list []noteBody
	raw := c.expect(c.do(http.MethodGet, "/notes", nil), http.StatusOK, &list)

	if len(list) != 2 {
		t.Fatalf("got %d notes, want 2", len(list))
	}
	if list[0].ID != second.ID || list[1].ID != first.ID {
		t.Errorf("order = %q, %q; want newest first", list[0].Title, list[1].Title)
	}
	if strings.Contains(raw, "contentMd") {
		t.Error("the list ships full note markdown; it only needs titles and labels")
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
		{"leading blank lines are skipped", "\n\n  catatan singkat\n", "catatan singkat"},
		{"nothing at all", "", "Tanpa judul"},
		// `::` used to be cut here, because the line was a card and its front
		// made the better title. It is ordinary prose now and must survive.
		{"a line containing ::", "Apa itu prior? :: Keyakinan awal\n", "Apa itu prior? :: Keyakinan awal"},
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
		math := c.domainID("math")
		note := c.createNote(map[string]any{
			"title": "n", "contentMd": "isi", "domainId": math,
		})
		if note.DomainID == nil || *note.DomainID != math {
			t.Errorf("domainId = %v, want %s", note.DomainID, math)
		}
	})

	// Domains are per-user (D-046). The composite foreign key is what makes
	// this impossible (D-047); the handler's job is to turn it into a 400
	// rather than let a constraint violation surface as a 500. The answer is
	// identical to an unknown domain, so the endpoint cannot be used to
	// discover that someone else's domain exists (D-039).
	t.Run("another user's domain is a 400, not a 500", func(t *testing.T) {
		other := app.newClient(t)
		res := c.do(http.MethodPost, "/notes", map[string]any{
			"title": "n", "contentMd": "isi", "domainId": other.domainID("math"),
		})
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", res.StatusCode)
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
