package api

import (
	"net/http"
	"time"

	"github.com/Katzelabs/Konku/internal/srs"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

const (
	minDurationMinutes = 1
	maxDurationMinutes = 480
	// clockSkewDays bounds how far a client's date may sit from the server's.
	// The widest real timezone spread is about 26 hours, so two days can never
	// reject an honest client — it only catches a device whose clock is wrong,
	// which would otherwise write sessions into a year that never arrives.
	clockSkewDays = 2
)

type sessionRequest struct {
	DomainID        *string `json:"domainId"`
	DurationMinutes int     `json:"durationMinutes"`
	// SessionDate is the client's LOCAL calendar date as YYYY-MM-DD.
	SessionDate string `json:"sessionDate"`
}

type sessionResponse struct {
	ID              string    `json:"id"`
	DomainID        *string   `json:"domainId"`
	DurationMinutes int32     `json:"durationMinutes"`
	SessionDate     string    `json:"sessionDate"`
	CompletedAt     time.Time `json:"completedAt"`
}

// handleCreateSession logs a completed focus session.
//
// sessionDate arrives from the client and is never derived from now() here. A
// session finished at 23:50 belongs to that day, and the server may well be in
// a different timezone than the person who ran the timer — deriving it
// server-side puts some users' evening work on tomorrow, silently.
func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	var req sessionRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.DurationMinutes < minDurationMinutes || req.DurationMinutes > maxDurationMinutes {
		writeError(w, http.StatusBadRequest, CodeBadRequest, copyFor(r).Sessions.BadDuration)
		return
	}
	domainID, ok := s.parseDomain(w, r, req.DomainID)
	if !ok {
		return
	}

	date, err := store.ToTime(srs.Date(req.SessionDate))
	if err != nil {
		writeError(w, http.StatusBadRequest, CodeBadRequest, copyFor(r).Sessions.BadDate)
		return
	}
	if !withinClockSkew(date, time.Now()) {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			copyFor(r).Sessions.DateTooFarOff)
		return
	}

	sess, err := scoped(s, r, func(q *gen.Queries) (gen.FocusSession, error) {
		return q.InsertFocusSession(r.Context(), gen.InsertFocusSessionParams{
			UserID:          user.ID,
			DomainID:        domainID,
			DurationMinutes: int32(req.DurationMinutes),
			SessionDate:     date,
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusCreated, toSessionResponse(sess))
}

// handleListSessions returns the recent focus sessions, newest first.
//
// A plain log, not a report: no streak, no per-domain quota progress, no
// target. What it answers is "did I sit down, and for how long" — the weekly
// quota stays a direction marker rather than a debt to settle (D-007, D-009,
// D-054).
//
// It answers with the page shape for `total`, and only for `total`. There is
// deliberately no offset: this is a window over the log, not a browsable
// history, and scrolling back through months of it is the Activity log
// (PRD §5.10), still deferred. What it could not do before was say how many
// sessions it was a window onto — thirty rows read identically whether the
// account held thirty or three hundred, which is the half of D-084's bug that
// misinforms rather than hides.
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	// Limit only. Offset stays zero, so the echoed `offset: 0` is the truth
	// about this endpoint rather than a page position.
	paging := listParams{Limit: intParam(r, "limit", defaultLimit, 1, maxLimit)}

	rows, err := scoped(s, r, func(q *gen.Queries) ([]gen.ListRecentFocusSessionsRow, error) {
		return q.ListRecentFocusSessions(r.Context(), gen.ListRecentFocusSessionsParams{
			UserID: user.ID,
			Limit:  int32(paging.Limit),
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	// The total rides on the rows, and with no offset an empty result really
	// does mean an empty log — so this needs none of pageTotal's re-ask.
	var total int64
	if len(rows) > 0 {
		total = rows[0].Total
	}

	out := make([]sessionResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toSessionResponse(row.FocusSession))
	}

	writeJSON(w, http.StatusOK, newPage(out, total, paging))
}

func toSessionResponse(sess gen.FocusSession) sessionResponse {
	return sessionResponse{
		ID:              sess.ID.String(),
		DomainID:        uuidString(sess.DomainID),
		DurationMinutes: sess.DurationMinutes,
		SessionDate:     string(store.FromTime(sess.SessionDate)),
		CompletedAt:     sess.CompletedAt,
	}
}

// withinClockSkew compares calendar dates only. Both sides are reduced to a
// day count so the comparison never depends on the time of day.
func withinClockSkew(claimed, now time.Time) bool {
	server, err := store.ToTime(srs.Today(now))
	if err != nil {
		return false
	}
	diff := claimed.Sub(server)
	if diff < 0 {
		diff = -diff
	}
	return diff <= clockSkewDays*24*time.Hour
}
