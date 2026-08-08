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

// TestNoteDeleteAndRestore. Deleting is soft (00005): the note leaves every
// normal path but survives, and the Terhapus view is what makes restoring
// possible after the user has navigated away.
func TestNoteDeleteAndRestore(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	tag := c.createCategory("Statistika")
	note := c.createNote(map[string]any{
		"title": "Teorema Bayes", "contentMd": "isi", "categoryIds": []string{tag.ID},
	})

	c.expect(c.do(http.MethodDelete, "/notes/"+note.ID, nil), http.StatusNoContent, nil)

	t.Run("a deleted note is gone from the list and the editor", func(t *testing.T) {
		var list []noteBody
		c.expect(c.do(http.MethodGet, "/notes", nil), http.StatusOK, &list)
		for _, got := range list {
			if got.ID == note.ID {
				t.Fatal("a deleted note is still listed")
			}
		}
		if res := c.do(http.MethodGet, "/notes/"+note.ID, nil); res.StatusCode != http.StatusNotFound {
			t.Errorf("get status = %d, want 404 for a deleted note", res.StatusCode)
		}
		// Editing one would silently resurrect it, which is worse than a 404:
		// the note would reappear in the list with no one having restored it.
		res := c.do(http.MethodPatch, "/notes/"+note.ID, map[string]any{"title": "diubah"})
		if res.StatusCode != http.StatusNotFound {
			t.Errorf("patch status = %d, want 404 for a deleted note", res.StatusCode)
		}
	})

	t.Run("the Terhapus view lists it", func(t *testing.T) {
		var deleted []noteBody
		c.expect(c.do(http.MethodGet, "/notes?deleted=true", nil), http.StatusOK, &deleted)
		if len(deleted) != 1 || deleted[0].ID != note.ID {
			t.Fatalf("deleted list = %v, want the one deleted note", deleted)
		}
	})

	t.Run("a category count excludes it", func(t *testing.T) {
		// The join row survives so a restore brings the label back with the
		// note, but counting it would read as "1 catatan" beside an empty list.
		var cats []categoryBody
		c.expect(c.do(http.MethodGet, "/categories", nil), http.StatusOK, &cats)
		for _, got := range cats {
			if got.ID == tag.ID && got.NoteCount != 0 {
				t.Errorf("noteCount = %d, want 0 while the note is deleted", got.NoteCount)
			}
		}
	})

	t.Run("restoring brings it back with its labels", func(t *testing.T) {
		c.expect(c.do(http.MethodPost, "/notes/"+note.ID+"/restore", nil), http.StatusNoContent, nil)

		var back noteBody
		c.expect(c.do(http.MethodGet, "/notes/"+note.ID, nil), http.StatusOK, &back)
		if back.Title != "Teorema Bayes" {
			t.Errorf("title = %q, want the note as it was", back.Title)
		}
		if len(back.CategoryIDs) != 1 || back.CategoryIDs[0] != tag.ID {
			t.Errorf("categoryIds = %v, want %v — labels survive a delete", back.CategoryIDs, tag.ID)
		}
	})

	t.Run("deleting twice is a 404, not a second delete", func(t *testing.T) {
		c.expect(c.do(http.MethodDelete, "/notes/"+note.ID, nil), http.StatusNoContent, nil)
		res := c.do(http.MethodDelete, "/notes/"+note.ID, nil)
		if res.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d, want 404 for an already-deleted note", res.StatusCode)
		}
	})
}

// TestBulkDeleteNotes covers the selection bar: several notes at once, and a
// count that reflects the rows that actually changed.
func TestBulkDeleteNotes(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	one := c.createNote(map[string]any{"title": "satu", "contentMd": "isi"})
	two := c.createNote(map[string]any{"title": "dua", "contentMd": "isi"})
	kept := c.createNote(map[string]any{"title": "tiga", "contentMd": "isi"})

	var out struct {
		Count int64 `json:"count"`
	}
	c.expect(c.do(http.MethodPost, "/notes/bulk-delete", map[string]any{
		"ids": []string{one.ID, two.ID},
	}), http.StatusOK, &out)
	if out.Count != 2 {
		t.Fatalf("count = %d, want 2", out.Count)
	}

	var list []noteBody
	c.expect(c.do(http.MethodGet, "/notes", nil), http.StatusOK, &list)
	if len(list) != 1 || list[0].ID != kept.ID {
		t.Fatalf("list = %v, want only the note that was not selected", list)
	}

	t.Run("bulk restore puts them back", func(t *testing.T) {
		c.expect(c.do(http.MethodPost, "/notes/bulk-restore", map[string]any{
			"ids": []string{one.ID, two.ID},
		}), http.StatusOK, &out)
		if out.Count != 2 {
			t.Fatalf("count = %d, want 2", out.Count)
		}
		c.expect(c.do(http.MethodGet, "/notes/"+one.ID, nil), http.StatusOK, nil)
	})

	// An id that names nothing this user owns is not an error — "delete these
	// three" is still satisfied — but it must not be counted, or the screen
	// would report more deleted than went.
	t.Run("ids that match nothing are not counted", func(t *testing.T) {
		other := app.newClient(t)
		theirs := other.createNote(map[string]any{"title": "milik orang lain", "contentMd": "isi"})

		c.expect(c.do(http.MethodPost, "/notes/bulk-delete", map[string]any{
			"ids": []string{one.ID, theirs.ID, uuid.NewString()},
		}), http.StatusOK, &out)
		if out.Count != 1 {
			t.Fatalf("count = %d, want 1 — only the caller's own note", out.Count)
		}

		// And the other user's note is untouched.
		other.expect(other.do(http.MethodGet, "/notes/"+theirs.ID, nil), http.StatusOK, nil)
	})

	t.Run("an empty or malformed selection is a 400", func(t *testing.T) {
		for _, body := range []map[string]any{
			{"ids": []string{}},
			{"ids": []string{"not-a-uuid"}},
		} {
			res := c.do(http.MethodPost, "/notes/bulk-delete", body)
			if res.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d for %v, want 400", res.StatusCode, body)
			}
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
		{"delete another user's note", http.MethodDelete, "/notes/" + note.ID, nil},
		{"restore another user's note", http.MethodPost, "/notes/" + note.ID + "/restore", nil},
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
