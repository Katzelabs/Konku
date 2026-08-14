package api_test

import (
	"fmt"
	"net/http"
	"testing"
)

// The index lists page, and say how many there are (D-084).
//
// What shipped before this: /notes applied a default limit of 50 and /cards
// had no OFFSET in its SQL at all, so note 51 and card 501 existed, counted
// against the account's quota, appeared in the export, and could not be
// reached by any request the app was able to make. Both screens then rendered
// the length of the truncated array as the total, so the UI stated a number
// that was not the number.
//
// These tests assert the behaviour rather than the wiring: a row past the
// first page is reachable, and the total describes the collection rather than
// the page.

const pageTestRows = 51

// pageOfIDs fetches one page of a list and returns the envelope with only the
// ids decoded — enough to assert which rows came back, in which order, and how
// many exist behind them.
func pageOfIDs(c *testClient, path string) pageBody[struct {
	ID string `json:"id"`
}] {
	c.t.Helper()

	var body pageBody[struct {
		ID string `json:"id"`
	}]
	c.expect(c.do(http.MethodGet, path, nil), http.StatusOK, &body)
	return body
}

// seedPagedNotes and seedPagedCards fill an account past one default page.
func seedPagedNotes(c *testClient, n int) {
	c.t.Helper()
	for i := range n {
		c.createNote(map[string]any{
			"title":     fmt.Sprintf("catatan %02d", i),
			"contentMd": "isi",
		})
	}
}

func seedPagedCards(c *testClient, n int) {
	c.t.Helper()
	for i := range n {
		c.createCard(map[string]any{
			"front": fmt.Sprintf("soal %02d", i),
			"back":  fmt.Sprintf("jawaban %02d", i),
		})
	}
}

func TestListsPageAndReportTheRealTotal(t *testing.T) {
	for _, tc := range []struct {
		name string
		path string
		seed func(*testClient, int)
	}{
		{"notes", "/notes", seedPagedNotes},
		{"cards", "/cards", seedPagedCards},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := newApp(t)
			c := app.newClient(t)
			tc.seed(c, pageTestRows)

			first := pageOfIDs(c, tc.path)

			// The default page is 50, and the total is the collection — not
			// the page. This is the half of the bug that misinformed: the
			// header said "50 catatan" to an account holding 51.
			if len(first.Items) != 50 {
				t.Fatalf("default page = %d rows, want 50", len(first.Items))
			}
			if first.Total != pageTestRows {
				t.Errorf("total = %d, want %d", first.Total, pageTestRows)
			}
			if first.Limit != 50 || first.Offset != 0 {
				t.Errorf("echoed limit/offset = %d/%d, want 50/0", first.Limit, first.Offset)
			}

			// And this is the half that hid: row 51 was unreachable.
			second := pageOfIDs(c, tc.path+"?offset=50")
			if len(second.Items) != 1 {
				t.Fatalf("second page = %d rows, want the one left over", len(second.Items))
			}
			if second.Total != pageTestRows {
				t.Errorf("second page total = %d, want %d", second.Total, pageTestRows)
			}

			// Walking the list end to end must yield every row exactly once.
			// A page boundary that lands in the middle of an ordering tie can
			// otherwise serve a row twice and skip another, which looks like
			// the list losing something — which is the failure this product
			// exists to prevent. The tiebreaker on id is what stops it.
			seen := map[string]bool{}
			for offset := 0; offset < pageTestRows; offset += 10 {
				got := pageOfIDs(c, fmt.Sprintf("%s?limit=10&offset=%d", tc.path, offset))
				for _, row := range got.Items {
					if seen[row.ID] {
						t.Errorf("row %s served twice while paging", row.ID)
					}
					seen[row.ID] = true
				}
			}
			if len(seen) != pageTestRows {
				t.Errorf("paged over %d distinct rows, want %d", len(seen), pageTestRows)
			}

			t.Run("an offset past the end is an empty page, not an error", func(t *testing.T) {
				// The last page of a list that shrank under the user, and a URL
				// someone edited. Neither is worth a 400.
				empty := pageOfIDs(c, tc.path+"?offset=9999")
				if len(empty.Items) != 0 {
					t.Errorf("got %d rows past the end, want none", len(empty.Items))
				}
				if empty.Total != pageTestRows {
					t.Errorf("total past the end = %d, want %d", empty.Total, pageTestRows)
				}
			})

			t.Run("limit is clamped, not honoured", func(t *testing.T) {
				// Otherwise ?limit=100000 is a way to ask the database for an
				// entire account's history in one query.
				big := pageOfIDs(c, tc.path+"?limit=100000")
				if len(big.Items) > 200 {
					t.Errorf("got %d rows, want the cap of 200", len(big.Items))
				}
				if big.Limit != 200 {
					t.Errorf("echoed limit = %d, want the cap of 200", big.Limit)
				}
			})
		})
	}
}

// The total is counted after the filters, so every view reports its own.
// A Terhapus screen stating the live total would be the same lie in reverse.
func TestListTotalsFollowTheFilters(t *testing.T) {
	t.Run("notes", func(t *testing.T) {
		app := newApp(t)
		c := app.newClient(t)

		math := c.createCategory("Matematika")
		tagged := c.createNote(map[string]any{"title": "ditandai", "categoryIds": []string{math.ID}})
		c.createNote(map[string]any{"title": "tidak ditandai"})
		c.expect(c.do(http.MethodDelete, "/notes/"+tagged.ID, nil), http.StatusNoContent, nil)

		live := pageOfIDs(c, "/notes")
		if live.Total != 1 {
			t.Errorf("live total = %d, want 1", live.Total)
		}
		deleted := pageOfIDs(c, "/notes?deleted=true")
		if deleted.Total != 1 {
			t.Errorf("Terhapus total = %d, want 1", deleted.Total)
		}
		filtered := pageOfIDs(c, "/notes?categoryId="+math.ID)
		if filtered.Total != 0 {
			t.Errorf("filtered total = %d, want 0 — its only note is deleted", filtered.Total)
		}
	})

	t.Run("cards", func(t *testing.T) {
		app := newApp(t)
		c := app.newClient(t)

		math := c.domainID("math")
		c.createCard(map[string]any{"front": "matriks", "back": "a", "domainId": math})
		c.createCard(map[string]any{"front": "sonata", "back": "b"})

		all := pageOfIDs(c, "/cards")
		if all.Total != 2 {
			t.Errorf("total = %d, want 2", all.Total)
		}
		byDomain := pageOfIDs(c, "/cards?domainId="+math)
		if byDomain.Total != 1 {
			t.Errorf("filtered total = %d, want 1", byDomain.Total)
		}
		byText := pageOfIDs(c, "/cards?q=sonata")
		if byText.Total != 1 {
			t.Errorf("search total = %d, want 1", byText.Total)
		}
	})
}

// Note search runs in SQL, not over whatever the first page happened to hold.
//
// It was a client-side filter on the loaded list, which searched 50 notes and
// presented the result as though it had searched all of them. Paging makes
// that worse rather than better: an empty result would then mean "not on this
// page" while looking exactly like "you never wrote it".
func TestNoteSearchReachesPastTheFirstPage(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	// Written first, so it sits last in a newest-first list and cannot be on
	// the first page of the 60 that follow it.
	buried := c.createNote(map[string]any{"title": "teorema bayes", "contentMd": "isi"})
	seedPagedNotes(c, 60)

	found := pageOfIDs(c, "/notes?q=bayes")
	if len(found.Items) != 1 || found.Items[0].ID != buried.ID {
		t.Fatalf("search returned %d notes, want the buried one", len(found.Items))
	}
	if found.Total != 1 {
		t.Errorf("search total = %d, want 1", found.Total)
	}

	t.Run("it is case-insensitive and matches part of a title", func(t *testing.T) {
		got := pageOfIDs(c, "/notes?q=BAYES")
		if len(got.Items) != 1 {
			t.Errorf("got %d notes for an uppercase query, want 1", len(got.Items))
		}
	})

	t.Run("a blank query is no filter, not an empty pattern", func(t *testing.T) {
		// `?q=` is what an emptied search box sends, and it must not be read
		// as a filter that happens to match everything by accident.
		got := pageOfIDs(c, "/notes?q=%20")
		if got.Total != 61 {
			t.Errorf("total = %d, want every note", got.Total)
		}
	})
}
