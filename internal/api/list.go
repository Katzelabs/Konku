package api

import (
	"net/http"
	"strings"
)

// One paginated shape for the index lists (D-084).
//
// Both lists used to answer with a bare JSON array and no total. The screens
// then rendered the length of that array as the count, so 300 notes read as
// "50 catatan" and note 51 could not be reached by any request the UI could
// make — the card list was worse, since its query had no OFFSET at all. A list
// that silently ends is the disappearance this product exists to prevent, and
// a count that describes the truncation rather than the collection is the same
// bug wearing a number.
const (
	// Shared by notes and cards so the two screens page identically. The cap
	// is not a performance guess: it is what stops `?limit=100000` from being
	// a way to ask the database for an account's entire history in one query.
	defaultLimit = 50
	maxLimit     = 200
)

// page is what every list endpoint returns.
//
// `total` is the number of rows matching the filters *before* LIMIT, counted
// by the same query that produced the page (see the window function in
// ListNotes/ListCards, and pageTotal for the empty-page case). `limit` and
// `offset` are echoed back so the client pages without having to remember what
// it asked for.
type page[T any] struct {
	Items  []T   `json:"items"`
	Total  int64 `json:"total"`
	Limit  int   `json:"limit"`
	Offset int   `json:"offset"`
}

// listParams is the paging half of a list request's query string.
type listParams struct {
	Limit  int
	Offset int
}

// listParamsFrom reads `?limit=` and `?offset=`, clamped rather than rejected:
// an out-of-range page is a URL someone edited or a stale client, and neither
// is worth a 400 when the honest answer is the nearest valid page. An offset
// past the end is not an error either — it lists nothing and reports the real
// total, which is exactly what the last page of a shrinking list looks like.
func listParamsFrom(r *http.Request) listParams {
	return listParams{
		Limit:  intParam(r, "limit", defaultLimit, 1, maxLimit),
		Offset: intParam(r, "offset", 0, 0, 1<<30),
	}
}

// pageTotal reads the pre-LIMIT total, which the list query carries on every
// row it returns.
//
// The catch is that a page can be empty while the collection is not: an offset
// past the end returns no rows, and the total rides on the rows. Reporting 0
// there would state "0 catatan" to an account holding 51 — the same lie this
// whole change exists to remove, just reached by a different door. So an empty
// page at a non-zero offset re-asks *the same query* for one row from the top.
//
// The same query, deliberately: a separate count with its own copy of the
// WHERE clause is a second predicate that can drift from the first, and then
// the number and the list disagree about what they are describing. This costs
// one extra round trip on a page nobody normally lands on.
func pageTotal[Row any](
	rows []Row,
	offset int,
	totalOf func(Row) int64,
	fromTheTop func() ([]Row, error),
) (int64, error) {
	if len(rows) > 0 {
		return totalOf(rows[0]), nil
	}
	// An empty first page is an empty list, and its total really is 0.
	if offset == 0 {
		return 0, nil
	}
	top, err := fromTheTop()
	if err != nil {
		return 0, err
	}
	if len(top) == 0 {
		return 0, nil
	}
	return totalOf(top[0]), nil
}

// textQuery reads a free-text filter, nil when absent or blank. The SQL takes
// it as a nullable text and treats NULL as "no filter", so whitespace must not
// arrive as an empty pattern that matches everything by accident.
func textQuery(r *http.Request, name string) *string {
	q := strings.TrimSpace(r.URL.Query().Get(name))
	if q == "" {
		return nil
	}
	return &q
}

// newPage assembles the response. Items is never nil — an empty list must
// serialise as `[]`, not `null`, so the client can map over it unguarded.
func newPage[T any](items []T, total int64, p listParams) page[T] {
	if items == nil {
		items = []T{}
	}
	return page[T]{Items: items, Total: total, Limit: p.Limit, Offset: p.Offset}
}
