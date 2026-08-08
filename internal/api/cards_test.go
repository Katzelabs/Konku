package api_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// Cards are a resource with their own CRUD (D-055). They used to be an effect
// of saving a note whose markdown held `Q :: A`, which is why none of this
// existed before.

func TestCardCRUD(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	math := c.domainID("math")
	tag := c.createCategory("Probabilitas")

	// Both sides are markdown and may span lines. They were single-line
	// strings until D-055 only because the parser rejected newlines outright,
	// so a fenced block is the case worth asserting.
	const back = "Keyakinan awal.\n\n```python\nprior = 0.5\n```"

	card := c.createCard(map[string]any{
		"front": "Apa itu prior?", "back": back,
		"domainId": math, "categoryIds": []string{tag.ID},
	})
	if card.Type != "basic" {
		t.Errorf("type = %q, want basic — cloze stays deferred to v0.2 (D-031)", card.Type)
	}
	if card.DomainID == nil || *card.DomainID != math {
		t.Errorf("domainId = %v, want %s", card.DomainID, math)
	}

	t.Run("a fetched card carries the answer and its labels", func(t *testing.T) {
		var got cardBody
		c.expect(c.do(http.MethodGet, "/cards/"+card.ID, nil), http.StatusOK, &got)
		if got.Back != back {
			t.Errorf("back = %q, want the markdown stored byte for byte", got.Back)
		}
		if len(got.CategoryIDs) != 1 || got.CategoryIDs[0] != tag.ID {
			t.Errorf("categoryIds = %v, want %v", got.CategoryIDs, tag.ID)
		}
	})

	t.Run("a patch is partial", func(t *testing.T) {
		var patched cardBody
		c.expect(c.do(http.MethodPatch, "/cards/"+card.ID, map[string]any{
			"front": "Apa itu prior (probabilitas)?",
		}), http.StatusOK, &patched)

		if patched.Front != "Apa itu prior (probabilitas)?" {
			t.Errorf("front = %q", patched.Front)
		}
		if patched.Back != back {
			t.Errorf("back = %q, want it left alone", patched.Back)
		}
		if len(patched.CategoryIDs) != 1 {
			t.Errorf("categoryIds = %v, want the stored label kept", patched.CategoryIDs)
		}
	})

	t.Run("delete then restore", func(t *testing.T) {
		c.expect(c.do(http.MethodDelete, "/cards/"+card.ID, nil), http.StatusNoContent, nil)

		var list []cardBody
		c.expect(c.do(http.MethodGet, "/cards", nil), http.StatusOK, &list)
		for _, got := range list {
			if got.ID == card.ID {
				t.Fatal("a deleted card is still listed")
			}
		}
		if res := c.do(http.MethodGet, "/cards/"+card.ID, nil); res.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d, want 404 for a deleted card", res.StatusCode)
		}

		c.expect(c.do(http.MethodPost, "/cards/"+card.ID+"/restore", nil), http.StatusNoContent, nil)
		c.expect(c.do(http.MethodGet, "/cards/"+card.ID, nil), http.StatusOK, nil)
	})
}

// TestCardListWithholdsTheAnswer. The list is the Cards page and the picker
// for a fixed exam's questions, and it is visited daily — shipping every
// answer with it would leave recall-before-reveal one dev-tools glance from
// being defeated (D-003).
func TestCardListWithholdsTheAnswer(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	const answer = "Keyakinan awal sebelum melihat data"
	c.createCard(map[string]any{"front": "Apa itu prior?", "back": answer})

	var list []cardBody
	raw := c.expect(c.do(http.MethodGet, "/cards", nil), http.StatusOK, &list)

	if len(list) != 1 || list[0].Front != "Apa itu prior?" {
		t.Fatalf("got %d cards, want the one with its prompt", len(list))
	}
	if strings.Contains(raw, answer) {
		t.Fatalf("the card list shipped the answer: %s", raw)
	}
	if strings.Contains(raw, `"back"`) {
		t.Fatalf("the card list has a back field: %s", raw)
	}
}

func TestCardFilters(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	math := c.domainID("math")
	tag := c.createCategory("Aljabar")

	tagged := c.createCard(map[string]any{
		"front": "Apa itu matriks?", "back": "a",
		"domainId": math, "categoryIds": []string{tag.ID},
	})
	c.createCard(map[string]any{"front": "Apa itu sonata?", "back": "b"})

	for _, tc := range []struct {
		name  string
		query string
	}{
		{"by domain", "?domainId=" + math},
		{"by category", "?categoryId=" + tag.ID},
		{"by text", "?q=matriks"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var list []cardBody
			c.expect(c.do(http.MethodGet, "/cards"+tc.query, nil), http.StatusOK, &list)
			if len(list) != 1 || list[0].ID != tagged.ID {
				t.Fatalf("got %d cards, want only the matching one", len(list))
			}
		})
	}
}

func TestCardValidation(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	// A card with no answer would sit in the due list forever teaching
	// nothing, and one with no prompt cannot be asked.
	for _, tc := range []struct {
		name string
		body map[string]any
	}{
		{"no front", map[string]any{"back": "a"}},
		{"no back", map[string]any{"front": "q"}},
		{"blank front", map[string]any{"front": "   ", "back": "a"}},
		{"unknown domain", map[string]any{"front": "q", "back": "a", "domainId": uuid.NewString()}},
		{"unknown category", map[string]any{"front": "q", "back": "a", "categoryIds": []string{uuid.NewString()}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := c.do(http.MethodPost, "/cards", tc.body)
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", res.StatusCode)
			}
		})
	}
}

// TestAnotherUsersCardIsNotFound: never 403 (D-039). Cards are top-level now,
// so they need this in their own right rather than inheriting it from a note.
func TestAnotherUsersCardIsNotFound(t *testing.T) {
	app := newApp(t)
	alice := app.newClient(t)
	bob := app.newClient(t)

	card := alice.createCard(map[string]any{"front": "rahasia", "back": "jawaban rahasia"})

	for _, tc := range []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{"get", http.MethodGet, "/cards/" + card.ID, nil},
		{"patch", http.MethodPatch, "/cards/" + card.ID, map[string]any{"front": "dibajak"}},
		{"delete", http.MethodDelete, "/cards/" + card.ID, nil},
		{"restore", http.MethodPost, "/cards/" + card.ID + "/restore", nil},
		{"a card that does not exist", http.MethodGet, "/cards/" + uuid.NewString(), nil},
		{"a malformed id", http.MethodGet, "/cards/not-a-uuid", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := bob.do(tc.method, tc.path, tc.body)
			if res.StatusCode != http.StatusNotFound {
				t.Fatalf("status = %d, want 404", res.StatusCode)
			}
		})
	}

	var after cardBody
	alice.expect(alice.do(http.MethodGet, "/cards/"+card.ID, nil), http.StatusOK, &after)
	if after.Front != "rahasia" {
		t.Errorf("front = %q, want unchanged", after.Front)
	}
}

func TestCategories(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	t.Run("the slug is derived and keeps / for nesting", func(t *testing.T) {
		cat := c.createCategory("Math/Aljabar Linear")
		if cat.Slug != "math/aljabar-linear" {
			t.Errorf("slug = %q, want math/aljabar-linear", cat.Slug)
		}
	})

	// Create-on-type: the picker posts the moment a user types a label that
	// does not exist yet, so a repeat must not put a conflict dialog in front
	// of capture (hard rule 7).
	t.Run("creating an existing label returns it rather than conflicting", func(t *testing.T) {
		first := c.createCategory("Statistik")

		res := c.do(http.MethodPost, "/categories", map[string]any{"label": "statistik"})
		if res.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200 for a label that already exists", res.StatusCode)
		}
		var again categoryBody
		c.expect(res, http.StatusOK, &again)
		if again.ID != first.ID {
			t.Errorf("id = %s, want the existing %s", again.ID, first.ID)
		}
	})

	t.Run("a blank or punctuation-only label is a 400", func(t *testing.T) {
		for _, label := range []string{"", "   ", "!!!"} {
			res := c.do(http.MethodPost, "/categories", map[string]any{"label": label})
			if res.StatusCode != http.StatusBadRequest {
				t.Errorf("label %q: status = %d, want 400", label, res.StatusCode)
			}
		}
	})

	t.Run("renaming carries every labelled item with it", func(t *testing.T) {
		cat := c.createCategory("Psikologi")
		note := c.createNote(map[string]any{"title": "n", "categoryIds": []string{cat.ID}})

		var renamed categoryBody
		c.expect(c.do(http.MethodPatch, "/categories/"+cat.ID,
			map[string]any{"label": "Psikologi Kognitif"}), http.StatusOK, &renamed)
		if renamed.ID != cat.ID {
			t.Fatal("a rename created a new category")
		}

		var got noteBody
		c.expect(c.do(http.MethodGet, "/notes/"+note.ID, nil), http.StatusOK, &got)
		if len(got.CategoryIDs) != 1 || got.CategoryIDs[0] != cat.ID {
			t.Errorf("categoryIds = %v, want the note still labelled", got.CategoryIDs)
		}
	})

	t.Run("renaming onto an existing slug is a 409", func(t *testing.T) {
		c.createCategory("Musik")
		other := c.createCategory("Fisika")

		res := c.do(http.MethodPatch, "/categories/"+other.ID, map[string]any{"label": "Musik"})
		if res.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409", res.StatusCode)
		}
	})
}

// TestDeletingAnInUseCategoryIs409, not a 500 and not a silent unlabelling of
// everything it was applied to (D-051).
func TestDeletingAnInUseCategoryIs409(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	onNote := c.createCategory("Dipakai Catatan")
	onCard := c.createCategory("Dipakai Kartu")
	unused := c.createCategory("Tidak Dipakai")

	c.createNote(map[string]any{"title": "n", "categoryIds": []string{onNote.ID}})
	c.createCard(map[string]any{"front": "q", "back": "a", "categoryIds": []string{onCard.ID}})

	for _, cat := range []categoryBody{onNote, onCard} {
		res := c.do(http.MethodDelete, "/categories/"+cat.ID, nil)
		if res.StatusCode != http.StatusConflict {
			t.Errorf("%s: status = %d, want 409", cat.Label, res.StatusCode)
		}
	}

	// An unused one still deletes cleanly, so no policy is needed for it.
	c.expect(c.do(http.MethodDelete, "/categories/"+unused.ID, nil), http.StatusNoContent, nil)

	t.Run("archiving is the way out for one in use", func(t *testing.T) {
		c.expect(c.do(http.MethodPost, "/categories/"+onNote.ID+"/archive", nil), http.StatusOK, nil)

		var list []categoryBody
		c.expect(c.do(http.MethodGet, "/categories", nil), http.StatusOK, &list)
		for _, got := range list {
			if got.ID == onNote.ID {
				t.Error("an archived category is still in the picker")
			}
		}

		// It is still attached to what it labelled — archiving hides it, it
		// does not detach it.
		c.expect(c.do(http.MethodGet, "/categories?includeArchived=true", nil), http.StatusOK, &list)
		for _, got := range list {
			if got.ID == onNote.ID {
				if got.NoteCount != 1 {
					t.Errorf("noteCount = %d, want 1 — archiving detached the label", got.NoteCount)
				}
				return
			}
		}
		t.Error("the archived category is missing even with includeArchived")
	})
}

func TestAnotherUsersCategoryIsNotFound(t *testing.T) {
	app := newApp(t)
	alice := app.newClient(t)
	bob := app.newClient(t)

	cat := alice.createCategory("Rahasia")

	for _, tc := range []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{"patch", http.MethodPatch, "/categories/" + cat.ID, map[string]any{"label": "dibajak"}},
		{"delete", http.MethodDelete, "/categories/" + cat.ID, nil},
		{"archive", http.MethodPost, "/categories/" + cat.ID + "/archive", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := bob.do(tc.method, tc.path, tc.body)
			if res.StatusCode != http.StatusNotFound {
				t.Fatalf("status = %d, want 404", res.StatusCode)
			}
		})
	}

	t.Run("alice's category is absent from bob's list", func(t *testing.T) {
		var list []categoryBody
		bob.expect(bob.do(http.MethodGet, "/categories", nil), http.StatusOK, &list)
		if len(list) != 0 {
			t.Errorf("bob sees %d categories, want none", len(list))
		}
	})
}
