package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/getsentry/sentry-go"

	"github.com/Katzelabs/Konku/internal/api"
	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/web"
)

// Sentry tests, run without a DSN.
//
// sentry-go lets a client be built with a custom Transport, so the event can
// be inspected exactly as it would go over the wire — same BeforeSend, same
// serialisation. That is a stronger check than looking at the Sentry UI
// afterwards: "no PII in it" becomes an assertion over the payload rather than
// a thing somebody eyeballed once, and it runs on every CI build forever.
//
// The only thing a real DSN would add is proof of delivery, which is Sentry's
// job rather than this codebase's.

// captureTransport records events instead of sending them.
type captureTransport struct {
	mu     sync.Mutex
	events []*sentry.Event
}

func (c *captureTransport) Configure(sentry.ClientOptions)        {}
func (c *captureTransport) Flush(time.Duration) bool              { return true }
func (c *captureTransport) FlushWithContext(context.Context) bool { return true }
func (c *captureTransport) Close()                                {}

func (c *captureTransport) SendEvent(e *sentry.Event) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events = append(c.events, e)
}

func (c *captureTransport) captured() []*sentry.Event {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]*sentry.Event, len(c.events))
	copy(out, c.events)
	return out
}

// withSentryCapture installs a client whose events land in memory, and puts
// the previous hub back afterwards.
func withSentryCapture(t *testing.T) *captureTransport {
	t.Helper()

	tr := &captureTransport{}
	client, err := sentry.NewClient(sentry.ClientOptions{
		// A syntactically valid DSN pointing nowhere. The transport never
		// uses it, but the SDK refuses to build a reporting client without
		// one.
		Dsn:            "https://public@example.invalid/1",
		Transport:      tr,
		Release:        "test-release",
		Environment:    "test",
		SendDefaultPII: false,
		BeforeSend:     api.ScrubEventForTest,
	})
	if err != nil {
		t.Fatalf("building sentry client: %v", err)
	}

	prev := sentry.CurrentHub().Client()
	sentry.CurrentHub().BindClient(client)
	t.Cleanup(func() { sentry.CurrentHub().BindClient(prev) })

	return tr
}

// The acceptance criterion for P3: a panicking handler produces an event
// carrying the request id, and no PII.
func TestPanicProducesASentryEventWithTheRequestID(t *testing.T) {
	app := newApp(t)
	tr := withSentryCapture(t)
	c := app.newClient(t)

	res := c.do(http.MethodGet, "/__panic", nil)
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", res.StatusCode)
	}

	// The client still gets the one error shape, with the id on it — a panic
	// must not be the one failure that breaks the contract.
	var body struct {
		Error struct {
			Code      string `json:"code"`
			Message   string `json:"message"`
			RequestID string `json:"request_id"`
		} `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("panic response is not the standard error shape: %v", err)
	}
	if body.Error.Code != "internal" {
		t.Errorf("code = %q, want internal", body.Error.Code)
	}
	if body.Error.RequestID == "" {
		t.Fatal("panic response carries no request_id")
	}

	events := tr.captured()
	if len(events) == 0 {
		t.Fatal("the panic produced no Sentry event")
	}

	ev := events[len(events)-1]
	if got := ev.Tags["request_id"]; got != body.Error.RequestID {
		t.Errorf("event request_id = %q, response said %q; a screenshot must "+
			"find the event", got, body.Error.RequestID)
	}
	if ev.Tags["route"] == "" {
		t.Error("event carries no route tag")
	}
	if ev.User.ID != c.userID.String() {
		t.Errorf("event user id = %q, want %s", ev.User.ID, c.userID)
	}
}

// Hard rule 10, asserted on what actually leaves the process.
//
// This is the test that matters here. Sentry makes attaching the whole request
// trivial, and that one line would ship the session cookie — which IS the
// credential — along with the query string and every header.
func TestSentryEventCarriesNoPII(t *testing.T) {
	app := newApp(t)
	tr := withSentryCapture(t)
	c := app.newClient(t)

	secret := "isi-catatan-yang-sangat-rahasia"
	c.createNote(map[string]any{"title": "Rahasia", "contentMd": secret})

	res := c.do(http.MethodGet, "/__panic", nil)
	res.Body.Close()

	events := tr.captured()
	if len(events) == 0 {
		t.Fatal("no event captured")
	}

	for _, ev := range events {
		// Serialise it the way the SDK does, then search the bytes. Asserting
		// field by field would only ever cover the fields someone thought of.
		raw, err := json.Marshal(ev)
		if err != nil {
			t.Fatalf("marshalling event: %v", err)
		}
		payload := string(raw)

		for _, forbidden := range []struct{ what, value string }{
			{"the user's email", c.email},
			{"the session cookie", c.cookie.Value},
			{"the note body", secret},
			{"the password", testPassword},
		} {
			if strings.Contains(payload, forbidden.value) {
				t.Errorf("the Sentry payload contains %s — hard rule 10 says "+
					"it must not", forbidden.what)
			}
		}

		// And the structured fields that carry PII by construction.
		if ev.Request != nil {
			t.Error("event carries a Request: headers, cookies and query string")
		}
		if ev.User.Email != "" || ev.User.IPAddress != "" || ev.User.Username != "" {
			t.Errorf("event user carries identity beyond the id: %+v", ev.User)
		}
		if len(ev.Breadcrumbs) != 0 {
			t.Error("event carries breadcrumbs, which can hold urls with ids in them")
		}
		if ev.ServerName != "" {
			t.Errorf("event carries ServerName %q, which is usually a person's "+
				"machine name", ev.ServerName)
		}
	}
}

// The scrubber has to hold even when a caller attaches everything — that is
// the entire reason it exists as a second mechanism (hard rule 9).
func TestScrubberStripsAnAttachedRequest(t *testing.T) {
	ev := &sentry.Event{
		Request: &sentry.Request{
			URL:         "https://konku.example/api/notes?q=rahasia",
			Headers:     map[string]string{"Cookie": "konku_session=super-secret"},
			QueryString: "q=rahasia",
			Data:        `{"password":"hunter2"}`,
		},
		User: sentry.User{
			ID:        "11111111-1111-1111-1111-111111111111",
			Email:     "someone@example.com",
			IPAddress: "203.0.113.9",
			Username:  "someone",
		},
		Breadcrumbs: []*sentry.Breadcrumb{{Message: "GET /api/notes/abc"}},
		ServerName:  "kazeneeko.local",
	}

	out := api.ScrubEventForTest(ev, nil)
	if out == nil {
		t.Fatal("scrubber dropped the event entirely")
	}

	raw, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("marshalling: %v", err)
	}
	payload := string(raw)

	for _, leak := range []string{
		"super-secret", "someone@example.com", "203.0.113.9",
		"hunter2", "rahasia", "kazeneeko.local", "someone",
	} {
		if strings.Contains(payload, leak) {
			t.Errorf("scrubbed event still contains %q", leak)
		}
	}

	// The one identifier that survives, because it is the one that makes an
	// event actionable without identifying a person.
	if out.User.ID != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("user id = %q, want it kept", out.User.ID)
	}
}

// An empty DSN must be a no-op rather than an error: that is the normal
// configuration in dev and in tests, and every call site depends on not having
// to check.
func TestSentryDisabledWithoutADSN(t *testing.T) {
	if err := api.InitSentry(config.Config{}); err != nil {
		t.Fatalf("InitSentry with no DSN returned %v, want nil", err)
	}
}

// The panic route exists to exercise the panic path, and must not exist
// anywhere it could be reached in anger. An endpoint that reliably burns a
// goroutine and a 500 is a denial-of-service primitive handed over for free.
func TestPanicRouteIsDevOnly(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	// The dev server the rest of the suite uses has it.
	if res := c.do(http.MethodGet, "/__panic", nil); res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("dev status = %d, want 500 — the panic route should exist in dev",
			res.StatusCode)
	}

	// A production-configured server must not.
	prod := httptest.NewServer(api.NewServer(
		config.Config{Dev: false, SessionTTL: time.Hour},
		app.store, app.auth, nil, web.FS(),
	).Routes())
	t.Cleanup(prod.Close)

	req, err := http.NewRequest(http.MethodGet, prod.URL+"/api/__panic", nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.AddCookie(c.cookie)

	res, err := prod.Client().Do(req)
	if err != nil {
		t.Fatalf("GET /api/__panic on a production server: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusInternalServerError {
		t.Error("the panic route is reachable with Dev=false — it is a " +
			"denial-of-service primitive in production")
	}
	if res.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", res.StatusCode)
	}
}
