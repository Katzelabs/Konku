package api_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Katzelabs/Konku/internal/api"
)

/*
 * Client error reporting (F-03).
 *
 * The endpoint is unauthenticated, so what is worth asserting is everything
 * that makes that safe: it is bounded, it sanitises what it is given, and it is
 * limited. The Sentry half is asserted on the event that actually leaves,
 * through the capturing transport sentry_test.go already installs.
 */

// The route is a browser path, and a browser path carries note and card uuids.
// Sanitising is done in the client and again here, because the client half of a
// guarantee is one bug away from not running (hard rule 9).
func TestClientErrorRouteIsSanitised(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"plain path", "/notes", "/notes"},
		{
			"a uuid becomes a pattern",
			"/notes/6f1b8f8e-4a0e-4a0e-8f1b-8f8e4a0e4a0e",
			"/notes/{id}",
		},
		{
			"a query string is dropped",
			"/notes?q=rahasia",
			"/notes",
		},
		{"a hash is dropped", "/cards#bagian", "/cards"},
		{"empty is unknown", "", "unknown"},
		// Not a path at all: something hand-rolled, or a client bug. It is not
		// tagged as it arrived.
		{"an absolute url is unknown", "https://konku.example/notes?q=rahasia", "unknown"},
		{"long paths are cut", "/" + strings.Repeat("a", 500), "/" + strings.Repeat("a", 199) + "…"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := api.SanitizeClientRouteForTest(tc.in); got != tc.want {
				t.Errorf("sanitise(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// A rune-safe cut. The copy this app carries is Indonesian and a stack can hold
// anything; slicing by bytes would end a truncated message mid-character.
func TestClientErrorTruncationKeepsRunesWhole(t *testing.T) {
	got := api.TruncateRunesForTest(strings.Repeat("é", 10), 4)
	if got != "éééé…" {
		t.Errorf("truncate = %q, want %q", got, "éééé…")
	}
}

// The report the browser sends becomes an event, with the tags that make it
// findable and the source tag that says it is not the server's own failure.
func TestClientErrorProducesASentryEvent(t *testing.T) {
	app := newApp(t)
	tr := withSentryCapture(t)

	res := post(t, app, "/client-error", map[string]any{
		"message": "Cannot read properties of undefined",
		"stack":   "at NotesPage (index-abc.js:1:2345)",
		"route":   "/notes/6f1b8f8e-4a0e-4a0e-8f1b-8f8e4a0e4a0e",
		"kind":    "render",
	})
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.StatusCode)
	}

	events := tr.captured()
	if len(events) == 0 {
		t.Fatal("the report produced no Sentry event")
	}

	ev := events[len(events)-1]
	if ev.Message != "Cannot read properties of undefined" {
		t.Errorf("event message = %q", ev.Message)
	}
	// Without this tag a render throw in the SPA and a panic in a handler are
	// two events that look alike in one project.
	if ev.Tags["source"] != "client" {
		t.Errorf("event source = %q, want client", ev.Tags["source"])
	}
	if ev.Tags["kind"] != "render" {
		t.Errorf("event kind = %q, want render", ev.Tags["kind"])
	}
	if ev.Tags["route"] != "/notes/{id}" {
		t.Errorf("event route = %q, want the uuid replaced", ev.Tags["route"])
	}
	if ev.Tags["request_id"] == "" {
		t.Error("event carries no request_id")
	}
	if got, _ := ev.Contexts["client"]["stack"].(string); !strings.Contains(got, "NotesPage") {
		t.Errorf("event carries no stack: %v", ev.Contexts["client"])
	}
}

// kind is a Prometheus label. A label taken from a request body mints a time
// series per distinct value somebody chooses to send.
func TestClientErrorKindIsAnAllowlist(t *testing.T) {
	app := newApp(t)
	tr := withSentryCapture(t)

	res := post(t, app, "/client-error", map[string]any{
		"message": "gagal",
		"kind":    strings.Repeat("kind-", 100),
	})
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.StatusCode)
	}

	events := tr.captured()
	if len(events) == 0 {
		t.Fatal("no event captured")
	}
	if got := events[len(events)-1].Tags["kind"]; got != "unknown" {
		t.Errorf("kind = %q, want unknown", got)
	}
}

// An event with no message is an alert nobody can act on, and a stream of them
// is worse than none.
func TestClientErrorNeedsAMessage(t *testing.T) {
	app := newApp(t)

	res := post(t, app, "/client-error", map[string]any{"message": "   ", "kind": "render"})
	if res.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", res.StatusCode)
	}
}

// The endpoint is open, so the body limit is the thing standing between it and
// somebody writing megabytes into an error tracker. It is well under the
// megabyte decodeJSON allows every other route.
func TestClientErrorBodyIsBounded(t *testing.T) {
	app := newApp(t)

	res := post(t, app, "/client-error", map[string]any{
		"message": "gagal",
		"stack":   strings.Repeat("x", 64<<10),
		"kind":    "render",
	})
	if res.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for an oversized report", res.StatusCode)
	}
}

// Unauthenticated: the crash worth catching most is the one that strands
// somebody on the login screen, and a reporter that only works once you are
// signed in would be silent for exactly that case.
func TestClientErrorNeedsNoSession(t *testing.T) {
	app := newApp(t)

	res := post(t, app, "/client-error", map[string]any{"message": "gagal di layar masuk", "kind": "render"})
	if res.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d, want 204 without a session", res.StatusCode)
	}
}

// Open and unauthenticated means rate-limited by IP, like every other
// unauthenticated write path (D-039).
func TestClientErrorIsRateLimited(t *testing.T) {
	app := newApp(t)

	var last int
	for i := 0; i < api.MaxClientErrorsForTest+1; i++ {
		res := post(t, app, "/client-error", map[string]any{
			// A distinct message each time: the browser dedupes, and this is the
			// bound on a client that does not.
			"message": "gagal nomor " + strings.Repeat("i", i+1),
			"kind":    "render",
		})
		last = res.StatusCode
	}

	if last != http.StatusTooManyRequests {
		t.Errorf("report %d status = %d, want 429", api.MaxClientErrorsForTest+1, last)
	}
}
