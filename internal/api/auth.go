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

// The session cookie's two names.
//
// __Host- is a prefix the *browser* enforces: it refuses to store the cookie
// unless it is Secure, Path=/ and has no Domain attribute. What that buys here
// is protection from a sibling host — katzeapps.com is shared across projects
// (D-068), and without the prefix any subdomain able to set a cookie on the
// parent domain can overwrite the session cookie of this one. The prefix makes
// that overwrite impossible rather than merely unlikely.
//
// The dev name exists because the prefix's own requirement defeats it locally:
// Secure is false in dev so http://localhost works (see setSessionCookie), and
// a __Host- cookie without Secure is one the browser silently declines to
// store — which does not look like a security feature, it looks like login is
// broken. So the name follows the same flag the attribute does.
const (
	sessionCookie    = "__Host-konku_session"
	devSessionCookie = "konku_session"
)

// sessionCookieName is the name this server writes.
func (s *Server) sessionCookieName() string {
	if s.cfg.Dev {
		return devSessionCookie
	}
	return sessionCookie
}

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
		Name:  s.sessionCookieName(),
		Value: id,
		// Required by the __Host- prefix, and correct regardless. No Domain
		// attribute either, which is the other half of what the prefix demands
		// — and is what stops the cookie being sent to a sibling host.
		Path: "/",
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

// clearSessionCookie expires both names.
//
// Both, because a cookie is cleared by name and this server has changed the
// name it writes. Somebody signed in before the rename is holding the old one;
// clearing only the new one would leave logout looking like it worked while the
// browser still presented a credential on the next request. Two Set-Cookie
// headers cost nothing and this stops being necessary only once no old cookie
// can still exist, which is a thing nobody can actually know.
func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	for _, name := range []string{sessionCookie, devSessionCookie} {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			Secure:   !s.cfg.Dev,
			MaxAge:   -1,
		})
	}
}

// credential pulls the session ID from either the cookie or a Bearer token.
//
// Handlers never learn which was used. That is what makes the v0.3 MCP server
// a new resolver rather than a new API surface (D-040).
//
// Both cookie names are accepted, prefixed first. That covers dev, which cannot
// use the prefix, and it means the rename does not sign everybody out: a
// browser holding the old cookie keeps working until the session expires on its
// own. Reading a name this server would not write is safe — the value is still
// an opaque server-side id that has to resolve to a live row, so accepting it
// under either name grants exactly nothing extra.
func credential(r *http.Request) string {
	for _, name := range []string{sessionCookie, devSessionCookie} {
		if c, err := r.Cookie(name); err == nil && c.Value != "" {
			return c.Value
		}
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
			c := copyFor(r)
			msg := c.Common.NotSignedIn
			if cred != "" {
				msg = c.Common.SessionExpired
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
				copyFor(r).Auth.EmailNotVerified)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// suspendedMessage is what a suspended account is told, wherever it is told
// (ticket 10, O1).
//
// One function rather than one string per call site, because it is one fact. It
// states the fact and where to ask about it, and it does not scold: hard rule 6
// rules out punitive copy, and a person reading this may well be here because
// somebody else's account was compromised, or because the operator got it
// wrong.
//
// The address comes from configuration rather than from the copy, and that is
// the deliberate half. It is deployment-specific exactly as PUBLIC_BASE_URL is
// — D-096 makes self-hosting a real outcome — so a hardcoded address would have
// every self-hosted instance point its users at somebody else's inbox. It also
// keeps changing the address a one-line config change rather than an edit to
// the same sentence in two languages. CONTACT_EMAIL defaults to the address
// already published on /privacy and /terms, so this deployment is unchanged.
func (s *Server) suspendedMessage(r *http.Request) string {
	return copyFor(r).Auth.AccountSuspended(s.contactEmail())
}

// defaultContactEmail is what CONTACT_EMAIL falls back to, and it matches the
// address /privacy and /terms already publish. A default rather than a required
// value because an empty one would put a sentence with a hole in it in front of
// somebody who is already locked out — the same reason maxNotes has one.
const defaultContactEmail = "konku@katzeapps.com"

func (s *Server) contactEmail() string {
	if s.cfg.ContactEmail != "" {
		return s.cfg.ContactEmail
	}
	return defaultContactEmail
}

// requireNotSuspended blocks an account the operator has suspended.
//
// The same seam as requireVerified and the same shape: a group inside
// requireUser, above every route that touches stored content, so a route added
// later is covered by default rather than when somebody remembers.
//
// 403 rather than 401, for the reason requireVerified is 403. A 401 means
// "authenticate", and the client acts on it by clearing the session and
// showing the login screen — which would put a suspended person in a loop:
// sign in, land nowhere, be signed out, sign in again. The caller is asking
// about their own account and already knows it exists, so nothing leaks by
// answering honestly, and CodeAccountSuspended is what lets a screen say so
// rather than render a generic permissions error.
//
// This is the second mechanism, not the only one (hard rule 9). Suspending
// also revokes the account's live sessions and login refuses outright, so in
// practice a suspended request rarely reaches here. What this covers is every
// way that could fail: a revocation that errored after the UPDATE committed, a
// session minted by some future path, a request already in flight. The gate
// reads the users row on every request through Resolve, so it is true the
// instant the column is written and needs nothing else to have worked.
func (s *Server) requireNotSuspended(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := UserFrom(r.Context())
		if !ok {
			// Unreachable behind requireUser, and a 500 rather than a silent
			// pass-through if the middleware order is ever changed.
			writeInternal(w, r, errors.New("api: requireNotSuspended ran outside requireUser"))
			return
		}
		if user.SuspendedAt != nil {
			// A user id and a request id are enough to debug and not enough to
			// leak (hard rule 10, D-062). Info rather than Warn: this is the
			// mechanism working, not a fault.
			slog.Info("blocked a request from a suspended account",
				"request_id", requestIDOf(w), "user_id", user.ID.String())
			writeError(w, http.StatusForbidden, CodeAccountSuspended, s.suspendedMessage(r))
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
	// FirstName and LastName are both sent, both possibly empty (00010).
	//
	// Empty is the honest answer for an account created by `konku seed-user`
	// and for anyone who signed up before the form asked. The client falls
	// back to the address rather than inventing something, so these are not
	// omitempty: "" is a value the UI acts on, and a missing key would make it
	// look like the server forgot rather than that nobody ever said.
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	// EmailVerified is what lets the client tell "signed in, nothing works
	// yet" apart from a broken session. Without it the only signal is a 403 on
	// the first data request, which reads as a bug.
	EmailVerified bool `json:"emailVerified"`
}

func toUserResponse(u gen.User) userResponse {
	return userResponse{
		ID:            u.ID.String(),
		Email:         u.Email,
		FirstName:     u.FirstName,
		LastName:      u.LastName,
		EmailVerified: u.EmailVerifiedAt != nil,
	}
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, CodeBadRequest, copyFor(r).Common.BadRequest)
		return
	}
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, copyFor(r).Auth.CredentialsRequired)
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
		if errors.Is(err, auth.ErrAccountSuspended) {
			// Only reachable with the right password (see auth.Login), so this
			// tells the account's owner something they are owed and tells a
			// stranger nothing. No session is minted and no cookie is set.
			writeError(w, http.StatusForbidden, CodeAccountSuspended, s.suspendedMessage(r))
			return
		}
		if errors.Is(err, auth.ErrInvalidCredentials) {
			// One message for both unknown-email and wrong-password: telling
			// them apart lets anyone enumerate registered addresses.
			writeError(w, http.StatusUnauthorized, CodeUnauthorized,
				copyFor(r).Auth.WrongCredentials)
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
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, copyFor(r).Common.NotSignedInShort)
		return
	}
	writeJSON(w, http.StatusOK, toUserResponse(user))
}
