package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/i18n"
)

// Mailer is the transport the account flows need.
//
// An interface rather than *mail.Sender so the api tests can run the whole
// signup path without a catcher, and so a nil one is a legible "mail is not
// configured" rather than a panic. Config already refuses to start with
// ALLOW_SIGNUP=true and no SMTP_URL, so a live signup route always has one.
//
// The locale is an explicit argument rather than something read off ctx, and
// internal/mail's SendVerification explains why: mail is the one thing that
// leaves, so a message in the wrong language is invisible to everybody who
// could notice. Today it is the requester's locale, which is the account
// holder's — signup, resend and reset are all requests made by the person the
// message is going to.
type Mailer interface {
	SendVerification(ctx context.Context, l i18n.Locale, to, token string) error
	SendPasswordReset(ctx context.Context, l i18n.Locale, to, token string) error
}

// minPasswordLength matches the seed-user command. A long passphrase beats
// complexity rules, and rules that annoy get worked around.
const minPasswordLength = 12

// mailSendTimeout bounds the send that happens after the account is already
// committed. The user is waiting on this request, and a slow provider must not
// hold it open for the router's full 30 seconds.
const mailSendTimeout = 10 * time.Second

// maxNameLength matches the CHECK constraint in migration 00010. Two
// mechanisms, not one (hard rule 9): this one produces a readable Indonesian
// message, the constraint is what holds if a future call site forgets.
const maxNameLength = 80

type signupRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
}

type verifyRequest struct {
	Token string `json:"token"`
}

type resendRequest struct {
	Email string `json:"email"`
}

type authConfigResponse struct {
	AllowSignup bool `json:"allowSignup"`
}

// handleAuthConfig tells the client which auth routes exist.
//
// Without it the login screen has to either show a signup link that 404s on a
// closed instance, or hide one that works. Neither is acceptable, and guessing
// from a failed POST means the user finds out by filling in a form first.
//
// Unauthenticated and deliberately thin: one boolean that is already visible
// from the outside — anyone can POST to /auth/signup and see whether it exists.
func (s *Server) handleAuthConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, authConfigResponse{AllowSignup: s.cfg.AllowSignup})
}

// handleSignup creates an unverified account and sends its verification mail.
//
// It answers **204 whether or not the address was already registered**. That is
// the whole shape of this handler: a signup form that says "already taken" is
// an account-existence oracle for every address an attacker cares to type, and
// the same reasoning already governs login and the not-found rule (D-039).
//
// The cost is a real one and worth naming: someone who genuinely forgot they
// had an account gets no feedback here. What they get instead is the mail —
// an already-registered address receives nothing new, and the recovery path is
// the reset link, which is where that person should be anyway.
func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	email := strings.TrimSpace(req.Email)
	if !validEmail(email) {
		writeError(w, http.StatusBadRequest, CodeBadRequest, copyFor(r).Auth.InvalidEmail)
		return
	}
	if len(req.Password) < minPasswordLength {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			copyFor(r).Auth.PasswordTooShort(minPasswordLength))
		return
	}

	firstName, ok := cleanName(req.FirstName)
	if !ok || firstName == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, copyFor(r).Auth.FirstNameRequired)
		return
	}
	// Optional, and it stays optional. Plenty of people have one name, and a
	// form that refuses to accept that tells them they are wrong about their
	// own name.
	lastName, ok := cleanName(req.LastName)
	if !ok {
		writeError(w, http.StatusBadRequest, CodeBadRequest, copyFor(r).Auth.LastNameTooLong)
		return
	}

	// Per-address limiting, on top of the per-IP limiter on the route. Per-IP
	// alone lets an attacker mailbomb one victim from many hosts (07 L3).
	if !s.signupAddrLimit.allow(strings.ToLower(email)) {
		writeError(w, http.StatusTooManyRequests, CodeRateLimited,
			copyFor(r).Common.TooManyForAddress)
		return
	}

	user, token, err := s.auth.Signup(r.Context(), auth.NewAccount{
		Email:     email,
		Password:  req.Password,
		FirstName: firstName,
		LastName:  lastName,
	})
	if err != nil {
		if errors.Is(err, auth.ErrEmailTaken) {
			// Same answer as success, and no mail. The log line records what
			// really happened — with no address in it (rule 10).
			slog.Info("signup for an address that already exists",
				"request_id", requestIDOf(w))
			writeJSON(w, http.StatusNoContent, nil)
			return
		}
		writeInternal(w, r, err)
		return
	}

	s.sendOrLog(r, "verification", user.ID.String(), func(ctx context.Context) error {
		return s.mailer.SendVerification(ctx, i18n.FromContext(ctx), user.Email, token)
	})

	writeJSON(w, http.StatusNoContent, nil)
}

// handleVerify spends a verification token.
//
// Registered unconditionally rather than behind ALLOW_SIGNUP: closing signup
// must not strand an account that was created while it was open and still has
// a live link in its owner's mailbox.
func (s *Server) handleVerify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if err := s.auth.VerifyEmail(r.Context(), req.Token); err != nil {
		if errors.Is(err, auth.ErrInvalidToken) {
			// One message for unknown, spent and expired. Distinguishing them
			// tells an attacker which guesses were close.
			writeError(w, http.StatusBadRequest, CodeInvalidToken,
				copyFor(r).Auth.VerifyLinkExpired)
			return
		}
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// handleResendVerification issues a fresh verification link.
//
// Always 204: unknown address, already-verified address and successful resend
// are indistinguishable from the client. Rate-limited by address as well as by
// IP, for the mailbomb reason above.
func (s *Server) handleResendVerification(w http.ResponseWriter, r *http.Request) {
	var req resendRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	email := strings.TrimSpace(req.Email)
	if !validEmail(email) {
		// Still 204. A 400 here would separate "not an address" from "not
		// registered" for anything that parses, which is most of what an
		// enumerator would try.
		writeJSON(w, http.StatusNoContent, nil)
		return
	}
	if !s.signupAddrLimit.allow(strings.ToLower(email)) {
		writeError(w, http.StatusTooManyRequests, CodeRateLimited,
			copyFor(r).Common.TooManyForAddress)
		return
	}

	user, token, err := s.auth.ResendVerification(r.Context(), email)
	if err != nil {
		if errors.Is(err, auth.ErrNothingToSend) {
			writeJSON(w, http.StatusNoContent, nil)
			return
		}
		writeInternal(w, r, err)
		return
	}

	s.sendOrLog(r, "verification", user.ID.String(), func(ctx context.Context) error {
		return s.mailer.SendVerification(ctx, i18n.FromContext(ctx), user.Email, token)
	})

	writeJSON(w, http.StatusNoContent, nil)
}

// sendOrLog sends and turns a failure into a log line rather than a 500.
//
// The account is already committed by the time this runs, so failing the
// request would tell the user that signup did not work when it did — and they
// would try again and hit "address taken", which answers 204 and sends nothing.
// That is a dead end. A logged failure plus a working resend button is the
// recoverable shape.
//
// Not a goroutine: the request's context is still alive here, and a detached
// send would lose its request id and its place in the log.
func (s *Server) sendOrLog(r *http.Request, kind, userID string, send func(context.Context) error) {
	ctx, cancel := context.WithTimeout(r.Context(), mailSendTimeout)
	defer cancel()

	if err := send(ctx); err != nil {
		// user_id and request_id, never the address (rule 10, D-062).
		slog.Error("could not send "+kind+" mail",
			"request_id", middleware.GetReqID(r.Context()), "user_id", userID, "error", err)
		reportError(r, err, middleware.GetReqID(r.Context()))
	}
}

// cleanName trims a submitted name and reports whether it is storable.
//
// Deliberately not a pattern match on letters. There is no character class
// that spans the names people actually have — apostrophes, hyphens, spaces,
// non-Latin scripts, single-word names — and every attempt at one ends up
// rejecting somebody real. So this rejects only what is definitely not a name.
//
// What it does reject:
//
//   - Control characters, including newlines. This is the one with a security
//     edge rather than a cosmetic one: a name is the obvious thing to greet
//     someone by in mail, and a CR or LF in a value that reaches a header is
//     header injection. Blocking it at the boundary means no future template
//     has to remember.
//   - Anything longer than the column allows, counted in runes so that a name
//     in a non-Latin script is measured the way Postgres's length() measures
//     it rather than in bytes.
//
// Escaping is not this function's job — the frontend renders React elements
// and never innerHTML (D-018), so a name containing "<script>" is text on the
// screen, not a script. Stripping it here would silently rename people.
func cleanName(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > maxNameLength {
		return "", false
	}
	for _, r := range s {
		if r == utf8.RuneError || unicode.IsControl(r) {
			return "", false
		}
	}
	return s, true
}

// validEmail is a parse, not a pattern.
//
// net/mail.ParseAddress accepts "Name <a@b>", which is not what a signup form
// means, so the display-name form is rejected explicitly. Anything stricter
// belongs to the mail server: the only real proof an address works is that
// mail sent to it arrives, which is exactly what verification is for.
func validEmail(s string) bool {
	if s == "" || len(s) > 254 || strings.ContainsAny(s, " <>,") {
		return false
	}
	addr, err := mail.ParseAddress(s)
	return err == nil && addr.Address == s && strings.Count(s, "@") == 1
}
