package api

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/Katzelabs/Konku/internal/auth"
)

type deleteAccountRequest struct {
	Password string `json:"password"`
}

// handleDeleteAccount removes the account and everything it owns (07 L7).
//
// The password is required. A session is enough authority to read and write
// notes; it is not enough to destroy the account irreversibly, and the gap
// between those two matters most on a borrowed laptop. This is the only
// endpoint in the app that re-authenticates.
//
// The client offers the export first. That is a UI obligation rather than a
// server one — refusing to delete until someone has downloaded a file would be
// the app deciding it knows better than the person asking — but it is the
// reason L7 depends on L6 and not the other way round.
func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, copyFor(r).Common.NotSignedIn)
		return
	}

	var req deleteAccountRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Password == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			copyFor(r).Account.ConfirmWithPassword)
		return
	}

	if err := s.auth.DeleteAccount(r.Context(), user.ID, req.Password); err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, CodeUnauthorized,
				copyFor(r).Account.WrongPasswordNotDeleted)
			return
		}
		writeInternal(w, r, err)
		return
	}

	// user_id and request_id, never the address (rule 10). This is the one
	// event in the system that cannot be reconstructed from the database
	// afterwards, because the database no longer has anything to reconstruct
	// it from — so it is worth a line of its own.
	slog.Info("account deleted",
		"request_id", middleware.GetReqID(r.Context()), "user_id", user.ID.String())

	// Every session went with the account, including this one, so the cookie
	// now points at nothing. Clearing it means the browser lands on the login
	// screen rather than on a "session expired" error.
	s.clearSessionCookie(w)
	writeJSON(w, http.StatusNoContent, nil)
}
