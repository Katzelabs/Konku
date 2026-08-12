package api_test

import (
	"net/http"
	"testing"
)

// Categories gained a colour and a management screen in 00011.
//
// The colour is user data on its way to an inline `style` attribute, so what
// these tests actually guard is that nothing unvalidated can get into that
// column, and that the two screens which write to it — the create-on-type
// picker in the editors, and Pengaturan — cannot undo each other.

// postCategory is the long form of app_test's createCategory: it sends an
// arbitrary body and asserts an exact status, which is what colour and
// idempotency need. The short helper stays for the many tests that only want a
// category to exist.
func (c *testClient) postCategory(body map[string]any, want int) categoryBody {
	c.t.Helper()
	var out categoryBody
	c.expect(c.do(http.MethodPost, "/categories", body), want, &out)
	return out
}

// Create-on-type posts a label and nothing else. Requiring a colour there
// would put a picker in front of capture, which hard rule 7 forbids.
func TestCategoryGetsADefaultColour(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	created := c.postCategory(map[string]any{"label": "Aljabar"}, http.StatusCreated)

	if created.Color != "#5C6B73" {
		t.Errorf("color = %q, want the neutral default #5C6B73", created.Color)
	}
}

func TestCategoryAcceptsAColourAtCreation(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	created := c.postCategory(
		map[string]any{"label": "Aljabar", "color": "#AA3344"}, http.StatusCreated)

	if created.Color != "#AA3344" {
		t.Errorf("color = %q, want #AA3344", created.Color)
	}
}

// The column is CHECK-constrained too (hard rule 9). This asserts the handler
// half, which is the one that produces a readable message instead of a 500.
func TestCategoryRejectsAMalformedColour(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	for _, bad := range []string{"red", "#FFF", "#12345", "#GGGGGG", "javascript:alert(1)"} {
		res := c.do(http.MethodPost, "/categories", map[string]any{
			"label": "Uji " + bad, "color": bad,
		})
		if res.StatusCode != http.StatusBadRequest {
			t.Errorf("colour %q: status = %d, want 400", bad, res.StatusCode)
		}
	}
}

// Recolouring from Pengaturan sends a colour and no label. A handler that read
// the missing label as "" would answer "Nama kategori tidak boleh kosong" to a
// request that never mentioned the name.
func TestCategoryUpdateIsAPatch(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	created := c.postCategory(map[string]any{"label": "Aljabar"}, http.StatusCreated)

	var recoloured categoryBody
	c.expect(c.do(http.MethodPatch, "/categories/"+created.ID, map[string]any{
		"color": "#8E7DBE",
	}), http.StatusOK, &recoloured)

	if recoloured.Color != "#8E7DBE" {
		t.Errorf("color = %q, want #8E7DBE", recoloured.Color)
	}
	if recoloured.Label != "Aljabar" {
		t.Errorf("label = %q, want it untouched at Aljabar", recoloured.Label)
	}

	// And the other way round: a rename must not reset the colour.
	var renamed categoryBody
	c.expect(c.do(http.MethodPatch, "/categories/"+created.ID, map[string]any{
		"label": "Aljabar Linear",
	}), http.StatusOK, &renamed)

	if renamed.Color != "#8E7DBE" {
		t.Errorf("color = %q, want the chosen colour to survive a rename", renamed.Color)
	}
	if renamed.Slug != "aljabar-linear" {
		t.Errorf("slug = %q, want aljabar-linear", renamed.Slug)
	}
}

// Create is idempotent, and that has to extend to the colour: typing an
// existing label in the editor's picker must not quietly repaint a category
// somebody coloured on purpose in Pengaturan.
func TestCreatingAnExistingCategoryDoesNotRecolourIt(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	created := c.postCategory(
		map[string]any{"label": "Aljabar", "color": "#AA3344"}, http.StatusCreated)

	// Same label, different colour, and 200 rather than 201 — it already exists.
	again := c.postCategory(
		map[string]any{"label": "Aljabar", "color": "#6A8D73"}, http.StatusOK)

	if again.ID != created.ID {
		t.Fatalf("id = %q, want the existing %q", again.ID, created.ID)
	}
	if again.Color != "#AA3344" {
		t.Errorf("color = %q, want the original #AA3344 to survive", again.Color)
	}
}

// The colour reaches the list, which is where every screen reads it from.
func TestListedCategoriesCarryTheirColour(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.postCategory(map[string]any{"label": "Aljabar", "color": "#B08968"}, http.StatusCreated)

	var list []categoryBody
	c.expect(c.do(http.MethodGet, "/categories", nil), http.StatusOK, &list)

	var found bool
	for _, cat := range list {
		if cat.Label != "Aljabar" {
			continue
		}
		found = true
		if cat.Color != "#B08968" {
			t.Errorf("color = %q, want #B08968", cat.Color)
		}
	}
	if !found {
		t.Fatal("the created category is not in the list")
	}
}

// The one test that is not negotiable (D-039): user B gets 404 for user A's
// row, never 403, so the API cannot be used to probe for another account's
// categories.
func TestCategoriesAreScopedToTheirOwner(t *testing.T) {
	app := newApp(t)
	a := app.newClient(t)
	b := app.newClient(t)

	mine := a.postCategory(map[string]any{"label": "Aljabar"}, http.StatusCreated)

	res := b.do(http.MethodPatch, "/categories/"+mine.ID, map[string]any{"color": "#AA3344"})
	if res.StatusCode != http.StatusNotFound {
		t.Errorf("recolouring another account's category: status = %d, want 404", res.StatusCode)
	}

	// B's own list does not contain it either.
	var list []categoryBody
	b.expect(b.do(http.MethodGet, "/categories", nil), http.StatusOK, &list)
	for _, cat := range list {
		if cat.ID == mine.ID {
			t.Fatal("another account's category is in this account's list")
		}
	}
}
