package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

const sessionCookie = "konku_session"

type ctxKey int

const userCtxKey ctxKey = iota

// UserFrom returns the authenticated user. Handlers behind requireUser can
// rely on it being present.
func UserFrom(ctx context.Context) (gen.User, bool) {
	u, ok := ctx.Value(userCtxKey).(gen.User)
	return u, ok
}

func (s *Server) setSessionCookie(w http.ResponseWriter, id string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:  sessionCookie,
		Value: id,
		Path:  "/",
		// HttpOnly keeps the session unreadable from JavaScript, so an XSS
		// cannot exfiltrate it — the reason this is a cookie and not a token
		// in localStorage.
		HttpOnly: true,
		// Lax rather than None: the SPA is served from the same origin as the
		// API (D-040), so the cookie never needs to travel cross-site.
		SameSite: http.SameSiteLaxMode,
		Secure:   !s.cfg.Dev,
		Expires:  expires,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   !s.cfg.Dev,
		MaxAge:   -1,
	})
}

// credential pulls the session ID from either the cookie or a Bearer token.
//
// Handlers never learn which was used. That is what makes the v0.3 MCP server
// a new resolver rather than a new API surface (D-040).
func credential(r *http.Request) string {
	if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
		return c.Value
	}
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return ""
}

func (s *Server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cred := credential(r)

		user, err := s.auth.Resolve(r.Context(), cred)
		if err != nil {
			if !errors.Is(err, auth.ErrNoSession) {
				writeInternal(w, err)
				return
			}
			// Distinguish "never signed in" from "session no longer valid".
			// Telling someone their session expired when they simply have not
			// logged in yet is confusing, and the copy rule is plain and
			// direct.
			msg := "Kamu belum masuk."
			if cred != "" {
				msg = "Sesi kamu sudah berakhir. Masuk lagi ya."
			}
			writeError(w, http.StatusUnauthorized, CodeUnauthorized, msg)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userCtxKey, user)))
	})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type userResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Permintaan tidak valid.")
		return
	}
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Email dan kata sandi wajib diisi.")
		return
	}

	user, sessionID, expires, err := s.auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			// One message for both unknown-email and wrong-password: telling
			// them apart lets anyone enumerate registered addresses.
			writeError(w, http.StatusUnauthorized, CodeUnauthorized,
				"Email atau kata sandi salah.")
			return
		}
		writeInternal(w, err)
		return
	}

	// Opportunistic cleanup; a failure here must not fail the login.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.auth.PurgeExpired(ctx)
	}()

	s.setSessionCookie(w, sessionID, expires)
	writeJSON(w, http.StatusOK, userResponse{ID: user.ID.String(), Email: user.Email})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if err := s.auth.Logout(r.Context(), credential(r)); err != nil {
		writeInternal(w, err)
		return
	}
	s.clearSessionCookie(w)
	writeJSON(w, http.StatusNoContent, nil)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, "Belum masuk.")
		return
	}
	writeJSON(w, http.StatusOK, userResponse{ID: user.ID.String(), Email: user.Email})
}
