package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/getsentry/sentry-go"

	"github.com/Katzelabs/Konku/internal/config"
)

// Error tracking (D-062, P3).
//
// A Recoverer writing to stdout on a box nobody reads is not an alert. Sentry
// gets panics and 5xx, tagged with the release so a regression points at a
// deploy.
//
// The hard part is not the wiring, it is hard rule 10: logs and events never
// carry a request body, a token, a password hash, or an email address. Sentry
// makes attaching the whole request a one-liner, and that one-liner would ship
// cookies — the session cookie *is* the credential — plus the query string and
// every header.
//
// So there are two mechanisms (hard rule 9):
//
//  1. Nothing that could carry PII is ever attached. The event is built from
//     a fixed set of fields: method, routed pattern, status, request id, and
//     user id. There is no code path that reaches for r.Header or r.Body.
//  2. BeforeSend strips Request, User details and breadcrumbs on the way out
//     regardless, so a future caller who does attach a request — or a future
//     version of the SDK that attaches one by default — cannot leak through.
//
// The second exists precisely because the first depends on everyone
// remembering. TestSentryEventCarriesNoPII drives real requests through the
// SDK with a capturing transport and asserts on the wire payload.

// InitSentry configures the global Sentry client.
//
// An empty DSN disables reporting and is the normal case in dev and in tests —
// sentry-go treats it as a no-op client rather than an error, so no call site
// needs to check whether Sentry is on.
func InitSentry(cfg config.Config) error {
	if cfg.SentryDSN == "" {
		slog.Info("sentry disabled (no SENTRY_DSN)")
		return nil
	}

	if err := sentry.Init(sentry.ClientOptions{
		Dsn: cfg.SentryDSN,
		// The release is what makes "this started three hours ago" answerable
		// as "this started with that deploy" (D-062).
		Release:     cfg.SentryRelease,
		Environment: cfg.SentryEnvironment,
		// Off, explicitly. With it on, the SDK attaches the client IP and the
		// user's address to events by default.
		SendDefaultPII: false,
		// No performance tracing: D-062 rejected distributed tracing for one
		// process and one database, and a trace sample carries URLs.
		EnableTracing: false,
		BeforeSend:    scrubEvent,
	}); err != nil {
		return fmt.Errorf("api: initialising sentry: %w", err)
	}

	slog.Info("sentry enabled", "release", cfg.SentryRelease, "environment", cfg.SentryEnvironment)
	return nil
}

// scrubEvent is the second mechanism: whatever the caller attached, this is
// what leaves the process.
//
// It removes rather than redacts. A redacted field is a promise that the
// redaction list is complete, and the list of headers that can carry a
// credential is not something to maintain by hand.
func scrubEvent(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
	// The whole request: headers (Cookie, Authorization), query string, body.
	event.Request = nil

	// The user id is the only identifier worth keeping and the only one
	// allowed (rule 10). Email, username and IP are dropped even if something
	// set them.
	event.User = sentry.User{ID: event.User.ID}

	// Breadcrumbs are automatic and can carry URLs with ids in them.
	event.Breadcrumbs = nil

	// Server name is the machine's hostname, which on a laptop is a person's
	// name more often than not.
	event.ServerName = ""

	delete(event.Contexts, "request")

	return event
}

// FlushSentry gives in-flight events a moment to leave on shutdown. Losing the
// event that explains why the process is going down would be a particular
// kind of unhelpful.
func FlushSentry() { sentry.Flush(2 * time.Second) }

// reportError sends a 5xx to Sentry with the context that is safe to send.
//
// Deliberately built field by field rather than from the request: see the note
// at the top of this file.
func reportError(r *http.Request, err error, requestID string) {
	if err == nil {
		return
	}

	hub := sentry.CurrentHub().Clone()
	hub.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(sentry.LevelError)
		scope.SetTag("request_id", requestID)
		scope.SetTag("method", r.Method)
		scope.SetTag("route", routePattern(r))

		if info := reqInfoFrom(r.Context()); info != nil && info.userID != "" {
			// An opaque uuid. It identifies the account, not the person, and
			// it is what makes "is this one user or all of them" answerable.
			scope.SetUser(sentry.User{ID: info.userID})
		}

		hub.CaptureException(err)
	})
}

// reportPanic sends a recovered panic. Separated from reportError because a
// panic is a different severity and carries a stack worth keeping.
func reportPanic(r *http.Request, recovered any, requestID string) {
	hub := sentry.CurrentHub().Clone()
	hub.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(sentry.LevelFatal)
		scope.SetTag("request_id", requestID)
		scope.SetTag("method", r.Method)
		scope.SetTag("route", routePattern(r))

		if info := reqInfoFrom(r.Context()); info != nil && info.userID != "" {
			scope.SetUser(sentry.User{ID: info.userID})
		}

		hub.RecoverWithContext(context.Background(), recovered)
	})
}

// reportClientError sends a crash that happened in the browser (F-03).
//
// Every argument has already been bounded and sanitised by handleClientError —
// this function trusts its caller and nothing else, exactly like the two above
// trust that nobody hands them an *http.Request to attach.
//
// `source` is the tag that matters. Without it a render throw in the SPA and a
// panic in a handler are two events that look alike in the same project, and
// the first question about any alert — is this us or is this the browser — would
// need reading the stack to answer.
//
// The stack rides in a context rather than as an exception: sentry-go builds
// stack traces from Go frames, and handing it a JavaScript one would produce a
// mangled trace instead of a readable string. scrubEvent drops the "request"
// context and leaves the rest, which is what keeps this one readable — and why
// the caller, not this function, is responsible for there being nothing in it
// that rule 10 forbids.
func reportClientError(message, stack, route, kind, requestID string) {
	hub := sentry.CurrentHub().Clone()
	hub.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(sentry.LevelError)
		scope.SetTag("source", "client")
		scope.SetTag("kind", kind)
		scope.SetTag("route", route)
		scope.SetTag("request_id", requestID)
		if stack != "" {
			scope.SetContext("client", sentry.Context{"stack": stack})
		}

		hub.CaptureMessage(message)
	})
}

// recoverer replaces chi's Recoverer so a panic becomes an alert rather than a
// line on a box nobody reads.
//
// It writes the same error shape as every other failure, so the client's
// single error path handles a panic identically to a handled 500 — including
// carrying the request id the user can read off the screen.
func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			// http.ErrAbortHandler is the documented way to abort a response
			// on purpose; it is not a bug and must not page anyone.
			if rec == http.ErrAbortHandler {
				panic(rec)
			}

			id := requestIDOf(w)
			slog.Error("panic recovered",
				"request_id", id, "method", r.Method, "route", routePattern(r),
				"panic", fmt.Sprint(rec))

			reportPanic(r, rec, id)
			writeError(w, http.StatusInternalServerError, CodeInternal,
				panicMessage(r, id))
		}()

		next.ServeHTTP(w, r)
	})
}

// panicMessage is what a recovered panic looks like from outside. Identical to
// writeInternal's, and deliberately so: from the reader's side a panic and a
// returned error are the same event, and a second sentence for one of them
// would be a tell.
func panicMessage(r *http.Request, id string) string {
	c := copyFor(r)
	if id == "" {
		return c.Common.ServerError
	}
	return c.Common.ServerErrorWithCode(id)
}
