package api

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/Katzelabs/Konku/internal/auth"
)

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// handleChangePassword replaces the password of the account making the request.
//
// The gap this fills: there was no route at all, so the only path to a new
// password was the forgot-password mail. That works, and it is the wrong shape
// for someone who still knows their password and simply wants a different one —
// and it is impossible on an instance with no SMTP configured, which is every
// instance where signup is closed.
//
// Under requireVerified with everything else. An unverified account could
// arguably be allowed — it knows its password, which is all this asks — but a
// second way in is a second thing to keep correct, and an account that cannot
// reach any data has nothing to protect by rotating.
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, "Kamu belum masuk.")
		return
	}

	var req changePasswordRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.CurrentPassword == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Masukkan kata sandi kamu saat ini.")
		return
	}
	if len(req.NewPassword) < minPasswordLength {
		// The same sentence signup and reset use. One rule stated three ways
		// would read as three rules.
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Kata sandi minimal 12 karakter. Kalimat yang panjang lebih aman dan lebih mudah diingat.")
		return
	}
	if req.NewPassword == req.CurrentPassword {
		// Refused rather than accepted as a no-op. Someone doing this believes
		// they have changed something, and letting them think so is worse than
		// telling them they have not — particularly when the reason they are
		// here is that they think the old one is compromised.
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Kata sandi baru masih sama dengan yang lama. Pilih yang berbeda ya.")
		return
	}

	if err := s.auth.ChangePassword(r.Context(), user.ID,
		req.CurrentPassword, req.NewPassword, credential(r)); err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, CodeUnauthorized,
				"Kata sandi saat ini salah. Kata sandi kamu tidak berubah.")
			return
		}
		writeInternal(w, r, err)
		return
	}

	// user_id and request_id, never the address (rule 10). Worth a line of its
	// own: a password change is what an account takeover looks like from the
	// outside, and the person reading the log after the fact needs to know when
	// it happened.
	slog.Info("password changed",
		"request_id", middleware.GetReqID(r.Context()), "user_id", user.ID.String())

	// No new cookie. The caller's session survives on purpose — see
	// ChangePassword — so the credential in the browser is still valid and
	// re-issuing it would only invite the question of why.
	writeJSON(w, http.StatusNoContent, nil)
}
