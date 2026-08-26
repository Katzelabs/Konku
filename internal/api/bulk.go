package api

import (
	"net/http"

	"github.com/google/uuid"
)

// Bulk delete and restore, shared by notes and cards.
//
// Both lists let the user tick several rows and act on them at once, and both
// resources soft-delete, so the two endpoints are the same shape twice. The
// parsing lives here rather than being written out in each file.

// maxBulkIDs bounds one request. Not a product rule — the selection bar has no
// limit and the user can tick a whole page — but the body decides how large
// the array handed to Postgres is, and an unbounded one is an unbounded query.
const maxBulkIDs = 500

type bulkRequest struct {
	IDs []string `json:"ids"`
}

// bulkResponse reports how many rows actually changed, which is not always how
// many were asked for: an id that was already deleted, already restored, or
// never this user's simply does not match. That is not an error — "delete
// these twelve" is satisfied when one of them had already gone — but the
// client shows the count, so it must be the true one.
type bulkResponse struct {
	Count int64 `json:"count"`
}

// parseBulkIDs decodes the body and validates the selection, writing its own
// 400s so handlers read as a straight line.
//
// An unparseable id is a 400 rather than being skipped: it means the client
// sent something it should not have, and silently ignoring it would report a
// count lower than the selection with no explanation. Duplicates are dropped,
// since ticking the same row twice is not a thing the UI can do and the SQL
// would ignore the repeat anyway.
func parseBulkIDs(w http.ResponseWriter, r *http.Request) ([]uuid.UUID, bool) {
	var req bulkRequest
	if !decodeJSON(w, r, &req) {
		return nil, false
	}
	if len(req.IDs) == 0 {
		writeError(w, http.StatusBadRequest, CodeBadRequest, copyFor(r).Bulk.NothingSelected)
		return nil, false
	}
	if len(req.IDs) > maxBulkIDs {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			copyFor(r).Bulk.TooManySelected)
		return nil, false
	}

	seen := make(map[uuid.UUID]bool, len(req.IDs))
	out := make([]uuid.UUID, 0, len(req.IDs))
	for _, raw := range req.IDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, CodeBadRequest, copyFor(r).Bulk.InvalidSelection)
			return nil, false
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out, true
}

// boolQuery reads a flag from the query string. Absent, empty and anything
// that is not "true" all mean false — the deleted list is the unusual view and
// has to be asked for explicitly, so a typo shows the live list rather than
// the bin.
func boolQuery(r *http.Request, name string) bool {
	return r.URL.Query().Get(name) == "true"
}
