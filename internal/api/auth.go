package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
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
				writeInternal(w, r, err)
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
		// Report the user back up to the request logger, which cannot see the
		// derived context created below. A user_id and a request ID are enough
		// to debug and not enough to leak (rule 10, D-062).
		if info := reqInfoFrom(r.Context()); info != nil {
			info.userID = user.ID.String()
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userCtxKey, user)))
	})
}

// requireVerified blocks every data route for an account that has not
// confirmed its address (07 L3).
//
// Placed inside requireUser rather than merged into it so that /auth/me and
// /auth/logout stay reachable while unverified. That is not a loophole: those
// two read the caller's own authentication state, which they have already
// proven, and without them the client has no way to render a "check your mail"
// screen or let the person sign out of it. Everything that touches stored
// content is behind this.
//
// 403 and not 404. Hard rule 4's "a wrong owner gets not found" is about
// another account's rows, where the status is itself information. Here the
// caller is asking about their own account and already knows it exists, so the
// honest answer is the useful one — and the client needs the code to show the
// resend button.
func (s *Server) requireVerified(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := UserFrom(r.Context())
		if !ok {
			// Unreachable behind requireUser, and a 500 rather than a silent
			// pass-through if the middleware order is ever changed.
			writeInternal(w, r, errors.New("api: requireVerified ran outside requireUser"))
			return
		}
		if user.EmailVerifiedAt == nil {
			writeError(w, http.StatusForbidden, CodeEmailUnverified,
				"Verifikasi alamat email kamu dulu ya. Cek kotak masuk untuk tautannya.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type userResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	// EmailVerified is what lets the client tell "signed in, nothing works
	// yet" apart from a broken session. Without it the only signal is a 403 on
	// the first data request, which reads as a bug.
	EmailVerified bool `json:"emailVerified"`
}

func toUserResponse(u gen.User) userResponse {
	return userResponse{
		ID:            u.ID.String(),
		Email:         u.Email,
		EmailVerified: u.EmailVerifiedAt != nil,
	}
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

	// Session fixation: an attacker who can plant a cookie sets the victim's
	// session id to one they know, waits for the victim to log in, and rides
	// the now-authenticated session. Minting a fresh id already defeats that,
	// but the planted session is still live until it expires — so the
	// credential presented with the login is revoked too (D-060).
	if old := credential(r); old != "" {
		if err := s.auth.Logout(r.Context(), old); err != nil {
			// Not fatal: failing to revoke a session that may not even exist
			// must not stop someone signing in.
			slog.Warn("could not revoke the session presented at login",
				"request_id", requestIDOf(w), "error", err)
		}
	}

	// Recorded so the sessions screen can say where a login came from (07 L5).
	// The User-Agent is bounded because it is an attacker-controlled header on
	// an unauthenticated route, and an unbounded one is a row as large as the
	// request allows. RealIP has already resolved the proxy headers.
	client := auth.Client{
		UserAgent: truncate(r.UserAgent(), maxUserAgent),
		IP:        clientKey(r),
	}

	user, sessionID, expires, err := s.auth.Login(r.Context(), req.Email, req.Password, client)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			// One message for both unknown-email and wrong-password: telling
			// them apart lets anyone enumerate registered addresses.
			writeError(w, http.StatusUnauthorized, CodeUnauthorized,
				"Email atau kata sandi salah.")
			return
		}
		writeInternal(w, r, err)
		return
	}

	// Opportunistic cleanup; a failure here must not fail the login.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.auth.PurgeExpired(ctx)
	}()

	s.setSessionCookie(w, sessionID, expires)
	writeJSON(w, http.StatusOK, toUserResponse(user))
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if err := s.auth.Logout(r.Context(), credential(r)); err != nil {
		writeInternal(w, r, err)
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
	writeJSON(w, http.StatusOK, toUserResponse(user))
}
