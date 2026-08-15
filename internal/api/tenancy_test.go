package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// The tenancy suite: one case per resource, asserting that user B gets 404 —
// never 403 — for user A's row (D-039, P7).
//
// 404 rather than 403 is the entire point. "Forbidden" confirms the row
// exists, which turns every endpoint into an oracle for enumerating other
// people's data. Scoping happens in the WHERE clause and again in the RLS
// policy, so "not yours" and "not there" are indistinguishable by
// construction rather than by a handler remembering to lie.
//
// This suite is what P1 is verified against, and it is the one test that is
// not negotiable when a resource is added. It was written because the P1
// verification exposed that no API-level tenancy test existed at all: with
// row security disabled on notes and the application predicate deleted, the
// whole api package stayed green.

// tenancyCase is one resource: how user A creates a row, and every route
// through which user B might reach it.
type tenancyCase struct {
	resource string
	// setup returns the path segments B will try, given A's freshly created row.
	setup func(t *testing.T, a *testClient) []probe
}

// probe is a single request B makes against A's row.
type probe struct {
	method string
	path   string
	body   any
}

func tenancyCases() []tenancyCase {
	return []tenancyCase{
		{
			resource: "notes",
			setup: func(t *testing.T, a *testClient) []probe {
				n := a.createNote(map[string]any{"title": "Milik A", "contentMd": "rahasia"})
				return []probe{
					{http.MethodGet, "/notes/" + n.ID, nil},
					{http.MethodPatch, "/notes/" + n.ID, map[string]any{"title": "dibajak"}},
					{http.MethodDelete, "/notes/" + n.ID, nil},
					{http.MethodPost, "/notes/" + n.ID + "/restore", nil},
				}
			},
		},
		{
			resource: "cards",
			setup: func(t *testing.T, a *testClient) []probe {
				c := a.createCard(map[string]any{"front": "soal A", "back": "jawab A"})
				return []probe{
					{http.MethodGet, "/cards/" + c.ID, nil},
					{http.MethodPatch, "/cards/" + c.ID, map[string]any{"front": "dibajak"}},
					{http.MethodDelete, "/cards/" + c.ID, nil},
					{http.MethodPost, "/cards/" + c.ID + "/restore", nil},
				}
			},
		},
		{
			resource: "categories",
			setup: func(t *testing.T, a *testClient) []probe {
				cat := a.createCategory("Kategori A")
				return []probe{
					{http.MethodPatch, "/categories/" + cat.ID, map[string]any{"label": "dibajak"}},
					{http.MethodDelete, "/categories/" + cat.ID, nil},
					{http.MethodPost, "/categories/" + cat.ID + "/archive", nil},
					{http.MethodPost, "/categories/" + cat.ID + "/unarchive", nil},
				}
			},
		},
		{
			resource: "domains",
			setup: func(t *testing.T, a *testClient) []probe {
				// Domains are per-user and seeded at signup (D-046), so A's
				// starter domain is already a row B must not be able to touch.
				id := a.domainID("math")
				return []probe{
					{http.MethodPatch, "/domains/" + id, map[string]any{"label": "dibajak"}},
					{http.MethodDelete, "/domains/" + id, nil},
					{http.MethodPost, "/domains/" + id + "/archive", nil},
					{http.MethodPost, "/domains/" + id + "/unarchive", nil},
				}
			},
		},
		{
			resource: "review sets",
			setup: func(t *testing.T, a *testClient) []probe {
				cards := a.seedCards(2, nil)
				e := a.createSet(map[string]any{
					"title": "Latihan A", "questionCount": 2, "selection": "fixed",
				})
				pinned := []map[string]any{{"cardId": cards[0].ID}, {"cardId": cards[1].ID}}
				return []probe{
					{http.MethodGet, "/review/sets/" + e.ID, nil},
					{http.MethodPatch, "/review/sets/" + e.ID, map[string]any{"title": "dibajak"}},
					{http.MethodDelete, "/review/sets/" + e.ID, nil},
					{http.MethodPost, "/review/sets/" + e.ID + "/archive", nil},
					{http.MethodPost, "/review/sets/" + e.ID + "/unarchive", nil},
					{http.MethodPut, "/review/sets/" + e.ID + "/cards", map[string]any{"cards": pinned}},
					{http.MethodPost, "/review/sets/" + e.ID + "/runs", map[string]any{"runDate": today()}},
				}
			},
		},
		{
			resource: "review runs",
			setup: func(t *testing.T, a *testClient) []probe {
				cards := a.seedCards(2, nil)
				// selection: fixed, because only a fixed set has a pinned card
				// list to PUT.
				e := a.createSet(map[string]any{
					"title": "Latihan A", "questionCount": 2, "selection": "fixed",
				})
				a.expect(a.do(http.MethodPut, "/review/sets/"+e.ID+"/cards",
					map[string]any{"cards": []map[string]any{
						{"cardId": cards[0].ID}, {"cardId": cards[1].ID},
					}}), http.StatusNoContent, nil)
				at := a.startRun(e.ID, http.StatusCreated)
				return []probe{
					{http.MethodGet, "/review/runs/" + at.ID, nil},
					{http.MethodDelete, "/review/runs/" + at.ID, nil},
					{http.MethodPost, "/review/runs/" + at.ID + "/finish", nil},
					{http.MethodGet, "/review/runs/" + at.ID + "/" + cards[0].ID + "/answer", nil},
					{http.MethodPost, "/review/runs/" + at.ID + "/" + cards[0].ID, map[string]any{"rating": "ingat"}},
				}
			},
		},
		{
			resource: "review due",
			setup: func(t *testing.T, a *testClient) []probe {
				c := a.createCard(map[string]any{"front": "soal A", "back": "jawab A"})
				return []probe{
					{http.MethodGet, "/review/due/" + c.ID + "/answer", nil},
					{http.MethodPost, "/review/due/" + c.ID, map[string]any{"rating": "ingat"}},
				}
			},
		},
	}
}

func TestTenancyEveryResourceAnswers404(t *testing.T) {
	app := newApp(t)

	// Two accounts for the whole suite, not two per subtest. Every case runs
	// from 127.0.0.1, and the login limiter allows ten attempts per five
	// minutes per IP — a client per subtest trips it and the failures then
	// look like tenancy bugs rather than the limiter doing its job.
	alice := app.newClient(t)
	bob := app.newClient(t)

	for _, tc := range tenancyCases() {
		t.Run(tc.resource, func(t *testing.T) {
			for _, p := range tc.setup(t, alice) {
				res := bob.do(p.method, p.path, p.body)

				if res.StatusCode == http.StatusForbidden {
					t.Errorf("%s %s returned 403 — a wrong owner must be "+
						"indistinguishable from a missing row, or the API "+
						"becomes an oracle for other users' ids (D-039)",
						p.method, p.path)
					continue
				}
				if res.StatusCode != http.StatusNotFound {
					t.Errorf("%s %s returned %d, want 404",
						p.method, p.path, res.StatusCode)
					continue
				}

				// The body has to be the one error shape, not an HTML page or
				// a bare string: the client has exactly one error path.
				var body struct {
					Error struct {
						Code string `json:"code"`
					} `json:"error"`
				}
				if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
					t.Errorf("%s %s: 404 body is not the standard error shape: %v",
						p.method, p.path, err)
					continue
				}
				if body.Error.Code != "not_found" {
					t.Errorf("%s %s: error code = %q, want not_found",
						p.method, p.path, body.Error.Code)
				}
			}
		})
	}
}

// Listing endpoints are the other half: a scoping bug there leaks rows
// wholesale rather than one id at a time, and it cannot be caught by
// probing a single resource.
func TestTenancyListsNeverLeakAnotherAccountsRows(t *testing.T) {
	app := newApp(t)

	alice := app.newClient(t)
	bob := app.newClient(t)

	note := alice.createNote(map[string]any{"title": "Rahasia A", "contentMd": "isi rahasia"})
	card := alice.createCard(map[string]any{"front": "soal A", "back": "jawab A"})
	cat := alice.createCategory("Kategori A")
	alice.expect(alice.do(http.MethodPost, "/sessions", map[string]any{
		"durationMinutes": 25, "sessionDate": today(),
	}), http.StatusCreated, nil)
	set := alice.createSet(map[string]any{"title": "Latihan A", "questionCount": 1})

	// Every list Bob can reach, and the id that must not appear in it.
	for _, tc := range []struct {
		path   string
		absent string
		what   string
	}{
		{"/notes", note.ID, "a note"},
		{"/notes?deleted=true", note.ID, "a deleted note"},
		{"/cards", card.ID, "a card"},
		{"/cards?deleted=true", card.ID, "a deleted card"},
		{"/categories", cat.ID, "a category"},
		{"/domains", alice.domainID("math"), "a domain"},
		{"/review/sets", set.ID, "a review set"},
		{"/sessions", "", "a focus session"},
		{"/review/due", card.ID, "a due card"},
	} {
		raw := bob.expect(bob.do(http.MethodGet, tc.path, nil), http.StatusOK, nil)
		if tc.absent != "" && strings.Contains(raw, tc.absent) {
			t.Errorf("GET %s leaked %s belonging to another account", tc.path, tc.what)
		}
		// The session list carries no id the test can pin, so assert on the
		// content instead: Bob has run no sessions, so his log is empty — and
		// the count of it is zero. The total is a window function over the
		// same query, so a scoping bug would inflate it even while the rows
		// stayed correctly empty.
		if tc.path == "/sessions" &&
			(!strings.Contains(raw, `"items":[]`) || !strings.Contains(raw, `"total":0`)) {
			t.Errorf("GET /sessions returned %s for an account with no sessions", raw)
		}
	}
}
