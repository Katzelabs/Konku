package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// captureLogs swaps the default slog handler for the duration of a test.
//
// The request logger writes through slog.Default, which is what production
// does, so asserting on that output is asserting on the real thing rather than
// on a seam invented for the test.
type logCapture struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (c *logCapture) Write(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.buf.Write(p)
}

func (c *logCapture) lines(t *testing.T) []map[string]any {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()

	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(c.buf.String()), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("log line is not JSON: %q", line)
		}
		out = append(out, m)
	}
	return out
}

func (c *logCapture) raw() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.buf.String()
}

func captureLogs(t *testing.T) *logCapture {
	t.Helper()
	cap := &logCapture{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(cap, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return cap
}

// requestLines returns only the per-request log lines.
func requestLines(t *testing.T, c *logCapture) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, l := range c.lines(t) {
		if l["msg"] == "request" {
			out = append(out, l)
		}
	}
	return out
}

// A request log line has to carry enough to operate against: the request ID
// that the user can read off their screen, the routed pattern, the status, and
// how long it took (D-062).
func TestRequestLogCarriesWhatOperatingNeeds(t *testing.T) {
	app := newApp(t)
	logs := captureLogs(t)
	c := app.newClient(t)

	c.expect(c.do(http.MethodGet, "/domains", nil), http.StatusOK, nil)

	lines := requestLines(t, logs)
	if len(lines) == 0 {
		t.Fatal("no request log lines were written")
	}

	var found map[string]any
	for _, l := range lines {
		if l["route"] == "/api/domains/" || l["route"] == "/api/domains" {
			found = l
		}
	}
	if found == nil {
		t.Fatalf("no log line for the domains request; got %v", lines)
	}

	for _, key := range []string{"request_id", "method", "route", "status", "duration_ms", "user_id"} {
		if _, ok := found[key]; !ok {
			t.Errorf("request log line is missing %q: %v", key, found)
		}
	}
	if found["user_id"] != c.userID.String() {
		t.Errorf("user_id = %v, want %s", found["user_id"], c.userID)
	}
	if found["status"] != float64(http.StatusOK) {
		t.Errorf("status = %v, want 200", found["status"])
	}
}

// Hard rule 10, asserted rather than hoped for: logs never carry a request
// body, a token, a password hash or an email address.
//
// This is the test that matters most in this file. Every one of these leaks is
// silent — the app works perfectly while writing PII to disk — and the natural
// way to debug a handler is to add exactly the field this forbids.
func TestRequestLogNeverCarriesSecretsOrPII(t *testing.T) {
	app := newApp(t)
	logs := captureLogs(t)
	c := app.newClient(t)

	// A write with a body, so there is something to leak.
	secret := "kalimat-rahasia-yang-tidak-boleh-bocor"
	note := c.createNote(map[string]any{"title": "Rahasia", "contentMd": secret})

	// An authenticated read, a 404, and a failed login — the paths most likely
	// to log "helpful" context.
	c.expect(c.do(http.MethodGet, "/notes/"+note.ID, nil), http.StatusOK, nil)
	c.do(http.MethodGet, "/notes/00000000-0000-0000-0000-000000000000", nil)

	res := login(t, app.srv, c.email, "kata-sandi-yang-salah")
	res.Body.Close()

	out := logs.raw()
	for _, forbidden := range []struct{ what, value string }{
		{"the note body", secret},
		{"the user's email", c.email},
		{"the correct password", testPassword},
		{"the wrong password", "kata-sandi-yang-salah"},
		{"the session cookie", c.cookie.Value},
	} {
		if strings.Contains(out, forbidden.value) {
			t.Errorf("logs contain %s — hard rule 10 says they must not", forbidden.what)
		}
	}
}

// The request ID has to reach the client, in the header and in the error body,
// or a screenshot cannot be turned into a log query (D-062).
func TestRequestIDReachesTheClientAndMatchesTheLog(t *testing.T) {
	app := newApp(t)
	logs := captureLogs(t)
	c := app.newClient(t)

	res := c.do(http.MethodGet, "/notes/00000000-0000-0000-0000-000000000000", nil)

	header := res.Header.Get("X-Request-Id")
	if header == "" {
		t.Fatal("X-Request-Id response header is empty")
	}

	var body struct {
		Error struct {
			Code      string `json:"code"`
			Message   string `json:"message"`
			RequestID string `json:"request_id"`
		} `json:"error"`
	}
	raw, _ := io.ReadAll(res.Body)
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("decoding %s: %v", raw, err)
	}
	if body.Error.RequestID != header {
		t.Errorf("body request_id = %q, header = %q; they must match",
			body.Error.RequestID, header)
	}

	// And the same value has to appear in the log, otherwise the round trip
	// is decorative.
	for _, l := range requestLines(t, logs) {
		if l["request_id"] == header {
			return
		}
	}
	t.Errorf("request id %q never appeared in a log line", header)
}

// Liveness must not depend on the database. This is the whole reason the
// endpoint was split (D-062): a liveness probe wired to the database restarts
// a perfectly healthy container during a blip.
func TestHealthzIsIndependentOfTheDatabase(t *testing.T) {
	app := newApp(t)

	res, err := app.srv.Client().Get(app.srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}

	// Close the pool out from under the server, then assert liveness still
	// answers while readiness does not.
	app.store.Close()

	live, err := app.srv.Client().Get(app.srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz with the database gone: %v", err)
	}
	defer live.Body.Close()
	if live.StatusCode != http.StatusOK {
		t.Errorf("/healthz status = %d with the database down, want 200 — "+
			"liveness must not depend on the database", live.StatusCode)
	}

	ready, err := app.srv.Client().Get(app.srv.URL + "/readyz")
	if err != nil {
		t.Fatalf("GET /readyz with the database gone: %v", err)
	}
	defer ready.Body.Close()
	if ready.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("/readyz status = %d with the database down, want 503",
			ready.StatusCode)
	}
}

// Readiness reports the schema it is serving against, which is what makes a
// rollback debuggable rather than mysterious.
func TestReadyzReportsSchemaVersion(t *testing.T) {
	app := newApp(t)

	res, err := app.srv.Client().Get(app.srv.URL + "/readyz")
	if err != nil {
		t.Fatalf("GET /readyz: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(res.Body)
		t.Fatalf("status = %d, want 200: %s", res.StatusCode, raw)
	}

	var body struct {
		Status        string `json:"status"`
		SchemaVersion int64  `json:"schema_version"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if body.Status != "ok" {
		t.Errorf("status = %q, want ok", body.Status)
	}
	if body.SchemaVersion == 0 {
		t.Error("schema_version = 0; readiness cannot prove migrations ran")
	}
}

// "How close is the pool to its cap" has to be answerable without writing
// code (D-062 / D-028). That means the gauges exist and carry real numbers.
func TestMetricsAnswerPoolSaturation(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	// Generate some traffic so the HTTP series exist.
	c.expect(c.do(http.MethodGet, "/domains", nil), http.StatusOK, nil)

	body := scrapeMetrics(t, app)

	for _, want := range []string{
		"konku_pgx_pool_acquired_conns",
		"konku_pgx_pool_max_conns",
		"konku_pgx_pool_empty_acquires_total",
		"konku_http_requests_total",
		"konku_http_request_duration_seconds_bucket",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("/metrics does not expose %s", want)
		}
	}

	// The cap is the denominator of the saturation question. If it is not the
	// real one, the ratio is a lie.
	if !strings.Contains(body, "konku_pgx_pool_max_conns 10") {
		t.Errorf("konku_pgx_pool_max_conns is not 10; D-028 caps the pool there.\n%s",
			grepLines(body, "konku_pgx_pool"))
	}
}

// Metrics are labelled by routed pattern, never the raw path. The raw path
// would mint a time series per note — an unbounded-cardinality memory leak,
// and resource UUIDs on a surface that gets scraped and stored.
func TestMetricsLabelByRouteNotRawPath(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	note := c.createNote(map[string]any{"title": "Kardinalitas", "contentMd": "x"})
	c.expect(c.do(http.MethodGet, "/notes/"+note.ID, nil), http.StatusOK, nil)

	body := scrapeMetrics(t, app)

	if strings.Contains(body, note.ID) {
		t.Errorf("/metrics contains a note uuid — labels must use the routed "+
			"pattern, not the raw path.\n%s", grepLines(body, "konku_http_requests_total"))
	}
	if !strings.Contains(body, `route="/api/notes/{id}"`) {
		t.Errorf("no series labelled with the routed pattern.\n%s",
			grepLines(body, "konku_http_requests_total"))
	}
}

// Metrics must not be reachable on the listener that faces users (D-062).
//
// Today they are not, because they live on a different socket entirely — but
// nothing else would notice if someone mounted the handler on the app router
// "just so it is easier to scrape", and the whole argument for the separate
// listener is that it cannot be undone by a configuration mistake.
func TestMetricsAreNotServedOnTheApplicationListener(t *testing.T) {
	app := newApp(t)

	res, err := app.srv.Client().Get(app.srv.URL + "/metrics")
	if err != nil {
		t.Fatalf("GET /metrics: %v", err)
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(res.Body)
	body := string(raw)

	// The SPA catch-all answers 200 with the HTML shell, which is fine. What
	// must never appear is the exposition format.
	for _, leak := range []string{
		"konku_pgx_pool_max_conns",
		"konku_http_requests_total",
		"# TYPE",
	} {
		if strings.Contains(body, leak) {
			t.Fatalf("the application listener served Prometheus output (%q). "+
				"/metrics belongs on the loopback listener only.", leak)
		}
	}
}

func scrapeMetrics(t *testing.T, app *testApp) string {
	t.Helper()

	rec := httptest.NewRecorder()
	app.metrics.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("/metrics status = %d, want 200", rec.Code)
	}
	return rec.Body.String()
}

func grepLines(body, prefix string) string {
	var b strings.Builder
	for _, l := range strings.Split(body, "\n") {
		if strings.HasPrefix(l, prefix) {
			b.WriteString(l)
			b.WriteString("\n")
		}
	}
	return b.String()
}
