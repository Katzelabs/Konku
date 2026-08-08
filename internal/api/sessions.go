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
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Durasi sesi tidak masuk akal.")
		return
	}
	domainID, ok := s.parseDomain(w, r, req.DomainID)
	if !ok {
		return
	}

	date, err := store.ToTime(srs.Date(req.SessionDate))
	if err != nil {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Tanggal sesi tidak valid.")
		return
	}
	if !withinClockSkew(date, time.Now()) {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Tanggal sesi terlalu jauh dari hari ini. Cek jam di perangkat kamu.")
		return
	}

	sess, err := s.store.Q().InsertFocusSession(r.Context(), gen.InsertFocusSessionParams{
		UserID:          user.ID,
		DomainID:        domainID,
		DurationMinutes: int32(req.DurationMinutes),
		SessionDate:     date,
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, toSessionResponse(sess))
}

// handleListSessions returns the recent focus sessions, newest first.
//
// A plain log, not a report: no totals, no streak, no per-domain quota
// progress. What it answers is "did I sit down, and for how long" — the
// weekly quota stays a direction marker rather than a debt to settle
// (D-007, D-009, D-054).
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	limit := intParam(r, "limit", defaultLimit, 1, maxLimit)

	rows, err := s.store.Q().ListRecentFocusSessions(r.Context(), gen.ListRecentFocusSessionsParams{
		UserID: user.ID,
		Limit:  int32(limit),
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	out := make([]sessionResponse, 0, len(rows))
	for _, sess := range rows {
		out = append(out, toSessionResponse(sess))
	}

	writeJSON(w, http.StatusOK, out)
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
