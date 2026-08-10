package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/Katzelabs/Konku/internal/auth"
)

type forgotRequest struct {
	Email string `json:"email"`
}

type resetRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// handleForgotPassword sends a reset link.
//
// **Always 204**, for a registered address and an unregistered one alike. Same
// existence-leak reasoning as the not-found rule (D-039): an endpoint that
// answers differently is a way to test whether someone has an account here,
// and "who uses this app" is exactly the kind of thing this product does not
// hand out (D-066).
//
// Rate-limited by address as well as by IP, for the same reason resend is:
// per-IP alone lets an attacker mailbomb one victim from many hosts.
func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	email := strings.TrimSpace(req.Email)
	if !validEmail(email) {
		// Still 204. A 400 for anything that parses as an address would split
		// "not an address" from "not registered", which is most of what an
		// enumerator would try.
		writeJSON(w, http.StatusNoContent, nil)
		return
	}
	if !s.signupAddrLimit.allow(strings.ToLower(email)) {
		writeError(w, http.StatusTooManyRequests, CodeRateLimited,
			"Terlalu banyak percobaan untuk alamat ini. Coba lagi beberapa menit lagi.")
		return
	}

	user, token, err := s.auth.RequestPasswordReset(r.Context(), email)
	if err != nil {
		if errors.Is(err, auth.ErrNothingToSend) {
			writeJSON(w, http.StatusNoContent, nil)
			return
		}
		writeInternal(w, r, err)
		return
	}

	s.sendOrLog(r, "password reset", user.ID.String(), func(ctx context.Context) error {
		return s.mailer.SendPasswordReset(ctx, user.Email, token)
	})

	writeJSON(w, http.StatusNoContent, nil)
}

// handleResetPassword spends a reset token and installs the new password.
//
// On success every session for the account is gone — including the caller's,
// if they had one. So this deliberately does not sign anyone in: the point of
// revoking sessions is that an attacker's session dies, and minting a fresh
// one here from a link that may have been fetched by a mail scanner would
// undo half of that. The user signs in with the password they just chose.
func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if len(req.Password) < minPasswordLength {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Kata sandi minimal 12 karakter. Kalimat yang panjang lebih aman dan lebih mudah diingat.")
		return
	}

	if err := s.auth.ResetPassword(r.Context(), req.Token, req.Password); err != nil {
		if errors.Is(err, auth.ErrInvalidToken) {
			// Unknown, expired, already used, and issued for a different
			// account all arrive here and all read the same. Telling them
			// apart tells an attacker which guesses were close (07 L4).
			writeError(w, http.StatusBadRequest, CodeInvalidToken,
				"Tautan ini tidak berlaku lagi. Minta tautan baru ya.")
			return
		}
		writeInternal(w, r, err)
		return
	}

	// The caller's own cookie now points at a session that no longer exists.
	// Clearing it means they land on the login screen rather than on a
	// "session expired" error they did not cause.
	s.clearSessionCookie(w)
	writeJSON(w, http.StatusNoContent, nil)
}
