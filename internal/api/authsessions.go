package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// The active sessions screen (07 L5).
//
// Mounted at /api/auth/sessions, not /api/sessions: the latter is the focus
// timer's, and has been since 03. The collision is worth naming because
// "sessions" means two unrelated things in this product — a login, and a
// stretch of study time (D-052 renamed the table for the same reason).

// maxUserAgent bounds what gets stored from an attacker-controlled header on
// an unauthenticated route. Real ones are a couple of hundred characters; this
// is generous enough never to truncate a genuine client, and notes.go's
// truncate marks anything it cuts with an ellipsis rather than cutting
// silently.
const maxUserAgent = 400

type authSessionBody struct {
	// ID is public_id, never the session id itself. The session id IS the
	// credential (D-039), so a list endpoint that returned it would hand every
	// live session of the account to any script on the page — and undo the
	// reason the cookie is HttpOnly (migration 00008).
	ID string `json:"id"`
	// Current marks the session making this request, so the UI can label it
	// and refuse to offer it a "revoke" button that reads as a logout.
	Current   bool      `json:"current"`
	CreatedAt time.Time `json:"createdAt"`
	LastSeen  time.Time `json:"lastSeen"`
	// UserAgent is the raw header, rendered by the client. Parsing it into
	// "Chrome on macOS" server-side would mean a UA-parsing dependency and a
	// table that goes stale (D-065); the raw string is honest and the person
	// reading it recognises their own devices.
	UserAgent string `json:"userAgent,omitempty"`
	// IP is shown as-is. There is deliberately no geolocation: turning it into
	// a city needs a GeoIP database, which is a dependency, a licence and a
	// refresh cadence — for a field whose only job is "do I recognise this?",
	// which the address already answers (see the note in 07 L5).
	IP string `json:"ip,omitempty"`
}

func (s *Server) handleListAuthSessions(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, copyFor(r).Common.NotSignedIn)
		return
	}

	rows, err := s.auth.ListSessions(r.Context(), user.ID, credential(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	out := make([]authSessionBody, 0, len(rows))
	for _, row := range rows {
		out = append(out, authSessionBody{
			ID:        row.PublicID.String(),
			Current:   row.IsCurrent,
			CreatedAt: row.CreatedAt,
			LastSeen:  row.LastSeenAt,
			UserAgent: deref(row.UserAgent),
			IP:        deref(row.Ip),
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// handleRevokeAuthSession signs out one session.
//
// Revoking the current one is allowed and is simply a logout, so the cookie is
// cleared when that happens — otherwise the browser keeps presenting a
// credential for a session that no longer exists, and the next request reads
// as "your session expired" rather than "you did that".
func (s *Server) handleRevokeAuthSession(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, copyFor(r).Common.NotSignedIn)
		return
	}

	publicID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		// Not a 400: an unparseable handle and a handle belonging to someone
		// else must look the same, or the difference is a probe (D-039).
		writeNotFound(w, r)
		return
	}

	// Read before deleting, so the response can tell the client it just
	// revoked itself. After the delete there is nothing left to compare.
	wasCurrent, err := s.isCurrentSession(r, user.ID, publicID)
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	deleted, err := s.auth.RevokeSession(r.Context(), user.ID, publicID)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	if !deleted {
		writeNotFound(w, r)
		return
	}

	if wasCurrent {
		s.clearSessionCookie(w)
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// handleRevokeOtherAuthSessions signs out everywhere else.
//
// "Else" is the whole point: this is the button someone presses when they
// think a device is compromised, and it has to leave them signed in here or
// they cannot see that it worked.
func (s *Server) handleRevokeOtherAuthSessions(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, copyFor(r).Common.NotSignedIn)
		return
	}

	if err := s.auth.RevokeOtherSessions(r.Context(), user.ID, credential(r)); err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// isCurrentSession reports whether a public handle names the caller's own
// session, scoped to the caller's rows.
func (s *Server) isCurrentSession(r *http.Request, userID, publicID uuid.UUID) (bool, error) {
	rows, err := s.auth.ListSessions(r.Context(), userID, credential(r))
	if err != nil {
		return false, err
	}
	for _, row := range rows {
		if row.PublicID == publicID {
			return row.IsCurrent, nil
		}
	}
	return false, nil
}
