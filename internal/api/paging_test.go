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

// The two lists D-084's original pass did not reach.
//
// `/review/sets` had no LIMIT in its SQL at all, and a set's run history was
// twenty rows drawn by a query with a hardcoded LIMIT and no OFFSET — so the
// twenty-first sitting of a set was counted in runCount, written to the
// export, and unreachable by any request the API could express. That is the
// same failure, in a corner the first sweep missed.

// seedPagedSets fills an account with n saved sets.
func seedPagedSets(c *testClient, n int) {
	c.t.Helper()
	for i := range n {
		c.createSet(map[string]any{
			"title":         fmt.Sprintf("latihan %02d", i),
			"selection":     "random",
			"questionCount": 1,
		})
	}
}

func TestReviewSetListPages(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	seedPagedSets(c, pageTestRows)

	first := pageOfIDs(c, "/review/sets")
	if len(first.Items) != 50 {
		t.Fatalf("default page = %d rows, want 50", len(first.Items))
	}
	if first.Total != pageTestRows {
		t.Errorf("total = %d, want %d", first.Total, pageTestRows)
	}

	second := pageOfIDs(c, "/review/sets?offset=50")
	if len(second.Items) != 1 {
		t.Fatalf("second page = %d rows, want the one left over", len(second.Items))
	}

	// Every set exactly once across the whole walk. The tiebreaker on id is
	// what stops a page boundary inside a created_at tie from serving one row
	// twice and skipping another — and sets made in a loop tie readily.
	seen := map[string]bool{}
	for offset := 0; offset < pageTestRows; offset += 10 {
		got := pageOfIDs(c, fmt.Sprintf("/review/sets?limit=10&offset=%d", offset))
		for _, row := range got.Items {
			if seen[row.ID] {
				t.Errorf("set %s served twice while paging", row.ID)
			}
			seen[row.ID] = true
		}
	}
	if len(seen) != pageTestRows {
		t.Errorf("paged over %d distinct sets, want %d", len(seen), pageTestRows)
	}

	// The archive is its own list with its own total, exactly as Terhapus is
	// for notes. An archive stating the live total would be the same lie.
	archived := first.Items[0].ID
	c.expect(c.do(http.MethodPost, "/review/sets/"+archived+"/archive", nil), http.StatusOK, nil)

	live := pageOfIDs(c, "/review/sets")
	if live.Total != pageTestRows-1 {
		t.Errorf("live total = %d, want %d", live.Total, pageTestRows-1)
	}
	inArchive := pageOfIDs(c, "/review/sets?archived=true")
	if inArchive.Total != 1 {
		t.Errorf("archive total = %d, want 1", inArchive.Total)
	}
}

// runTimes works a set through n complete sittings and returns their ids,
// newest last. Each run draws one question, answers it and finishes, because
// only a finished run is history.
func runTimes(c *testClient, setID string, n int) []string {
	c.t.Helper()

	out := make([]string, 0, n)
	for range n {
		run := c.startRun(setID, http.StatusCreated)
		for _, q := range run.Questions {
			c.answer(run.ID, q.CardID, map[string]any{"rating": "ingat"})
		}
		c.expect(c.do(http.MethodPost, "/review/runs/"+run.ID+"/finish", nil),
			http.StatusOK, nil)
		out = append(out, run.ID)
	}
	return out
}

func TestRunHistoryPagesPastTheOldCap(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(1, nil)
	set := c.createSet(map[string]any{
		"title": "Diulang terus", "selection": "random", "questionCount": 1,
	})

	// One past the twenty the old handler was hardcoded to.
	const sittings = 21
	ids := runTimes(c, set.ID, sittings)

	all := pageOfIDs(c, "/review/sets/"+set.ID+"/runs")
	if all.Total != sittings {
		t.Errorf("total = %d, want %d", all.Total, sittings)
	}
	if len(all.Items) != sittings {
		t.Fatalf("first page = %d runs, want all %d — the cap of 20 is still there",
			len(all.Items), sittings)
	}

	// The oldest sitting is the one the cap used to cut off. It is the last
	// row of a newest-first list, so reaching it needs an offset the API never
	// used to accept.
	tail := pageOfIDs(c, fmt.Sprintf("/review/sets/%s/runs?limit=1&offset=%d", set.ID, sittings-1))
	if len(tail.Items) != 1 {
		t.Fatalf("got %d runs at the end of the history, want 1", len(tail.Items))
	}
	if tail.Items[0].ID != ids[0] {
		t.Errorf("last row = %s, want the first sitting %s", tail.Items[0].ID, ids[0])
	}
	if tail.Total != sittings {
		t.Errorf("total on the last page = %d, want %d", tail.Total, sittings)
	}

	// An offset past the end reports the real total rather than zero. The
	// count rides on the rows, and there are none here to carry it.
	past := pageOfIDs(c, "/review/sets/"+set.ID+"/runs?offset=9999")
	if len(past.Items) != 0 {
		t.Errorf("got %d runs past the end, want none", len(past.Items))
	}
	if past.Total != sittings {
		t.Errorf("total past the end = %d, want %d", past.Total, sittings)
	}

	// Walking it end to end yields every sitting exactly once.
	seen := map[string]bool{}
	for offset := 0; offset < sittings; offset += 4 {
		got := pageOfIDs(c, fmt.Sprintf("/review/sets/%s/runs?limit=4&offset=%d", set.ID, offset))
		for _, row := range got.Items {
			if seen[row.ID] {
				t.Errorf("run %s served twice while paging", row.ID)
			}
			seen[row.ID] = true
		}
	}
	if len(seen) != sittings {
		t.Errorf("paged over %d distinct runs, want %d", len(seen), sittings)
	}
}

// The open sitting is not history, and the two numbers on the screen agree.
//
// The detail carries the unfinished run directly instead of the screen finding
// it in a list of runs — which is what makes "is there one to resume" a fact
// about the set rather than a fact about which page of history was loaded.
func TestOpenRunIsSeparateFromTheHistory(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(1, nil)
	set := c.createSet(map[string]any{
		"title": "Setengah jalan", "selection": "random", "questionCount": 1,
	})
	runTimes(c, set.ID, 2)

	// A third sitting, left open.
	open := c.startRun(set.ID, http.StatusCreated)

	var detail struct {
		RunCount int64 `json:"runCount"`
		OpenRun  *struct {
			ID string `json:"id"`
		} `json:"openRun"`
	}
	c.expect(c.do(http.MethodGet, "/review/sets/"+set.ID, nil), http.StatusOK, &detail)

	if detail.OpenRun == nil {
		t.Fatal("openRun is null while a sitting is in progress")
	}
	if detail.OpenRun.ID != open.ID {
		t.Errorf("openRun = %s, want the run in progress %s", detail.OpenRun.ID, open.ID)
	}

	history := pageOfIDs(c, "/review/sets/"+set.ID+"/runs")
	if history.Total != 2 {
		t.Errorf("history total = %d, want 2 — the open sitting is not a score", history.Total)
	}
	for _, row := range history.Items {
		if row.ID == open.ID {
			t.Error("the open sitting is listed as history")
		}
	}

	// runCount on the set and total on its history are separate queries and
	// must keep agreeing: both count finished runs.
	if detail.RunCount != history.Total {
		t.Errorf("runCount = %d but history total = %d — the two drifted",
			detail.RunCount, history.Total)
	}

	// Finishing it moves it into the history and both numbers follow.
	c.expect(c.do(http.MethodPost, "/review/runs/"+open.ID+"/finish", nil), http.StatusOK, nil)
	after := pageOfIDs(c, "/review/sets/"+set.ID+"/runs")
	if after.Total != 3 {
		t.Errorf("history total = %d after finishing, want 3", after.Total)
	}
	c.expect(c.do(http.MethodGet, "/review/sets/"+set.ID, nil), http.StatusOK, &detail)
	if detail.OpenRun != nil {
		t.Error("openRun is still set after the sitting was finished")
	}
}

// Another user's run history is not found, never forbidden (D-039). A new
// route is a new place to leak, and this is the test that is not negotiable.
func TestRunHistoryIsScopedToItsOwner(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(1, nil)
	set := c.createSet(map[string]any{
		"title": "Punya A", "selection": "random", "questionCount": 1,
	})
	runTimes(c, set.ID, 1)

	b := app.newClient(t)
	res := b.do(http.MethodGet, "/review/sets/"+set.ID+"/runs", nil)
	if res.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 — another user's history must not be probeable",
			res.StatusCode)
	}
}
