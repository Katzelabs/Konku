package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// Client error reporting (F-03).
//
// A throw during render unmounted the whole tree to a blank page, and nothing
// anywhere knew it had happened: Sentry runs in this process and stays there,
// because `connect-src 'self'` has no exception for an ingest host and adding
// one would widen the policy that is the second mechanism behind D-018's
// no-innerHTML rule (security.go). So the browser reports to its own origin and
// this process is what talks to Sentry — the SPA gets telemetry and the CSP
// does not lose a line.
//
// Three things make the endpoint safe to expose unauthenticated:
//
//  1. **An allowlist, not a passthrough.** Four fields are read and everything
//     else in the body is ignored. The event is built from those four, so there
//     is no path from the request into it that could be widened by accident —
//     the same argument reportError makes for building its event field by
//     field rather than from the *http.Request (sentry.go).
//  2. **Everything is bounded twice.** The body by a MaxBytesReader well under
//     maxRequestBody, then each field again after decoding, so a report cannot
//     become a way to write megabytes into an error tracker.
//  3. **The route is sanitised here as well as in the browser.** A path carries
//     note and card uuids; keeping those out of a log line and out of an event
//     tag is what routePattern already does for the server's own requests
//     (rule 10).
//
// Unauthenticated on purpose: the crash worth catching most is the one on the
// login screen, which is the one screen a broken session cannot get past. No
// user id is attached, and that is a decision rather than an oversight —
// resolving a session to label the event would make the crash path depend on a
// database read that itself writes (auth.Resolve throttles a last_seen_at
// update behind it), and "one account or all of them" is answerable from the
// volume and the route without it.

// maxClientErrorBody bounds the request. Far below maxRequestBody's megabyte: a
// message and a stack are a few kilobytes at the very outside, and the reader
// that accepts a note's markdown has no business accepting a crash report of
// the same size.
const maxClientErrorBody = 16 << 10

// Per-field caps, applied after decoding. The body limit above bounds what is
// read; these bound what is kept, so one enormous field cannot fill the budget
// the others need.
const (
	maxClientMessageLen = 300
	maxClientStackLen   = 4_000
	maxClientRouteLen   = 200
)

// The per-address budget. A page that crashes on load and gets reloaded a few
// times should be able to say so every time; a page stuck in a render loop
// should not be able to say so forever. The browser caps itself at five per
// page load, so this is the bound on a client that ignores its own cap.
const (
	maxClientErrorsPerHour = 30
	clientErrorWindow      = time.Hour
)

// clientErrorRequest is the whole of what this endpoint reads. Anything else in
// the body is decoded into nothing and discarded.
type clientErrorRequest struct {
	Message string `json:"message"`
	Stack   string `json:"stack"`
	Route   string `json:"route"`
	Kind    string `json:"kind"`
}

// The kinds the browser can report, and the reason this is an allowlist rather
// than the string it was sent: kind is a Prometheus label, and a label taken
// from a request body is an unbounded time series per distinct value — the same
// cardinality trap routePattern exists to avoid.
const (
	clientErrorRender    = "render"    // caught by an error boundary
	clientErrorGlobal    = "global"    // window 'error' — a handler or a callback
	clientErrorRejection = "rejection" // an unhandled promise rejection
	clientErrorUnknown   = "unknown"
)

func clientErrorKind(s string) string {
	switch s {
	case clientErrorRender, clientErrorGlobal, clientErrorRejection:
		return s
	default:
		return clientErrorUnknown
	}
}

// handleClientError records a crash that happened in the browser.
//
// It answers 204 and nothing else. There is no useful thing to tell a client
// whose report succeeded, and a body would be one more thing for a page that
// has already failed to parse.
func (s *Server) handleClientError(w http.ResponseWriter, r *http.Request) {
	var req clientErrorRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxClientErrorBody)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Permintaan tidak valid.")
		return
	}

	message := truncateRunes(strings.TrimSpace(req.Message), maxClientMessageLen)
	if message == "" {
		// An event with no message is an alert nobody can act on. Refusing it
		// makes a bug in the reporter show up as a 400 in the request log
		// rather than as a stream of blank events in Sentry.
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Permintaan tidak valid.")
		return
	}

	kind := clientErrorKind(req.Kind)
	route := sanitizeClientRoute(req.Route)
	stack := truncateRunes(req.Stack, maxClientStackLen)

	id := requestIDOf(w)

	// The log line carries the shape of the failure and not its content. A
	// report *is* a request body, and rule 10 says a body never reaches the
	// logs — so the message and the stack go to Sentry, which is the sink built
	// for them, and this line exists so that "the frontend is crashing" is
	// visible on a box with no Sentry configured at all.
	slog.Warn("client error reported", "request_id", id, "kind", kind, "route", route)

	s.metrics.clientErrorReported(kind)
	reportClientError(message, stack, route, kind, id)

	writeJSON(w, http.StatusNoContent, nil)
}

// uuidSegment matches a uuid anywhere in a path.
var uuidSegment = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

// sanitizeClientRoute turns a browser path into something safe to tag an event
// and a log line with.
//
// The browser sends `location.pathname` and strips the query string and the
// hash before it does. This repeats neither of those on trust: it takes the
// path apart again, drops anything past `?` or `#`, replaces every uuid with
// `{id}` and caps the length. Two mechanisms, because the client half of a
// guarantee is one bug away from not running at all (hard rule 9).
//
// A value that is not a path at all — the client sending something unexpected,
// or a hand-rolled request — becomes "unknown" rather than being tagged as it
// arrived.
func sanitizeClientRoute(route string) string {
	route = strings.TrimSpace(route)
	if i := strings.IndexAny(route, "?#"); i >= 0 {
		route = route[:i]
	}
	if route == "" || !strings.HasPrefix(route, "/") {
		return "unknown"
	}
	route = uuidSegment.ReplaceAllString(route, "{id}")
	return truncateRunes(route, maxClientRouteLen)
}

// truncateRunes cuts at a rune boundary. Slicing a Go string by bytes can land
// mid-sequence, and the copy this app carries is Indonesian — a message ending
// in a half-written character would be a mangled event rather than a truncated
// one.
func truncateRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	count := 0
	for i := range s {
		if count == max {
			return s[:i] + "…"
		}
		count++
	}
	return s
}
