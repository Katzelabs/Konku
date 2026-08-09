package api_test

import (
	"bytes"
	"net/http"
	"strings"
	"testing"
)

// Browser hardening (D-060, P4).

// The header set, asserted rather than assumed. Every one of these is invisible
// when it works and invisible when it is missing, which is exactly the kind of
// thing that rots.
func TestSecurityHeadersAreSet(t *testing.T) {
	app := newApp(t)

	res, err := app.srv.Client().Get(app.srv.URL + "/")
	if err != nil {
		t.Fatalf("GET /: %v", err)
	}
	defer res.Body.Close()

	for _, tc := range []struct{ header, want string }{
		{"X-Content-Type-Options", "nosniff"},
		{"Referrer-Policy", "strict-origin-when-cross-origin"},
		{"X-Frame-Options", "DENY"},
	} {
		if got := res.Header.Get(tc.header); got != tc.want {
			t.Errorf("%s = %q, want %q", tc.header, got, tc.want)
		}
	}

	csp := res.Header.Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("no Content-Security-Policy header")
	}

	// The two that carry the weight. 'unsafe-inline' in script-src is the
	// difference between a CSP and a decoration, and 'unsafe-eval' undoes it
	// almost as thoroughly.
	if strings.Contains(csp, "unsafe-inline") {
		t.Errorf("CSP contains 'unsafe-inline', which is the one thing P4 "+
			"exists to avoid:\n%s", csp)
	}
	if strings.Contains(csp, "unsafe-eval") {
		t.Errorf("CSP contains 'unsafe-eval':\n%s", csp)
	}
	for _, directive := range []string{
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self'",
		"frame-ancestors 'none'",
		"base-uri 'none'",
		"object-src 'none'",
	} {
		if !strings.Contains(csp, directive) {
			t.Errorf("CSP is missing %q:\n%s", directive, csp)
		}
	}
}

// The CSRF control (D-060). A cross-origin write with a perfectly valid
// session cookie must still be refused.
func TestCrossOriginWriteIsRefused(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	body := `{"title":"dari situs lain","contentMd":"x"}`
	req, err := http.NewRequest(http.MethodPost, app.srv.URL+"/api/notes",
		strings.NewReader(body))
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://jahat.example")
	req.AddCookie(c.cookie) // a real, valid session

	res, err := app.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("cross-origin POST: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 — a cross-origin write carrying a "+
			"valid cookie must be refused (D-060)", res.StatusCode)
	}
}

// Same-origin writes must keep working, or the control is just an outage.
func TestSameOriginWriteIsAllowed(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	req, err := http.NewRequest(http.MethodPost, app.srv.URL+"/api/notes",
		strings.NewReader(`{"title":"dari aplikasi","contentMd":"x"}`))
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// What the browser sends for the app's own fetch.
	req.Header.Set("Origin", "http://"+req.Host)
	req.AddCookie(c.cookie)

	res, err := app.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("same-origin POST: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		t.Errorf("status = %d, want 201 — the app's own writes must still work",
			res.StatusCode)
	}
}

// A form-encoded body is the shape of a form-based CSRF, and the one thing an
// HTML form can send that a fetch cannot fake without a preflight.
func TestFormEncodedWriteIsRefused(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	for _, ct := range []string{
		"application/x-www-form-urlencoded",
		"multipart/form-data; boundary=x",
		"text/plain",
	} {
		req, err := http.NewRequest(http.MethodPost, app.srv.URL+"/api/notes",
			bytes.NewReader([]byte("title=dibajak")))
		if err != nil {
			t.Fatalf("building request: %v", err)
		}
		req.Header.Set("Content-Type", ct)
		req.AddCookie(c.cookie)

		res, err := app.srv.Client().Do(req)
		if err != nil {
			t.Fatalf("POST with %s: %v", ct, err)
		}
		res.Body.Close()

		if res.StatusCode != http.StatusUnsupportedMediaType {
			t.Errorf("Content-Type %s got status %d, want 415 — these are the "+
				"three types an HTML form can produce", ct, res.StatusCode)
		}
	}
}

// A GET is not a write and must not be filtered by the origin check, or every
// link from another site into the app breaks.
func TestCrossOriginReadIsAllowed(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	req, err := http.NewRequest(http.MethodGet, app.srv.URL+"/api/notes", nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Origin", "https://lain.example")
	req.AddCookie(c.cookie)

	res, err := app.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("cross-origin GET: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200 — a GET is not a state change", res.StatusCode)
	}
}

// Session fixation: the session presented at login must not survive it
// (D-060). Minting a fresh id is not enough on its own — the id the attacker
// planted stays valid until it expires unless it is revoked.
func TestLoginRotatesAndRevokesThePresentedSession(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	before := c.cookie.Value

	// Log in again while holding the existing session, the way a victim would
	// after an attacker planted one.
	req, err := http.NewRequest(http.MethodPost, app.srv.URL+"/api/auth/login",
		strings.NewReader(`{"email":"`+c.email+`","password":"`+testPassword+`"}`))
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(c.cookie)

	res, err := app.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("second login: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, want 200", res.StatusCode)
	}

	after := sessionCookie(t, res).Value
	if after == before {
		t.Fatal("the session id did not change across login — a fixated " +
			"session would survive authentication")
	}

	// And the planted one is dead.
	check, err := http.NewRequest(http.MethodGet, app.srv.URL+"/api/auth/me", nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	check.AddCookie(&http.Cookie{Name: "konku_session", Value: before})

	got, err := app.srv.Client().Do(check)
	if err != nil {
		t.Fatalf("checking the old session: %v", err)
	}
	defer got.Body.Close()

	if got.StatusCode != http.StatusUnauthorized {
		t.Errorf("the pre-login session still authenticates (status %d); "+
			"an attacker who planted it keeps access", got.StatusCode)
	}
}

// An unbounded note body is a memory-exhaustion primitive the moment anyone
// can sign up (D-060). decodeJSON bounds every body; this asserts it.
func TestOversizedBodyIsRejected(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	// Comfortably past the 1 MiB cap.
	huge := `{"title":"besar","contentMd":"` + strings.Repeat("a", 2<<20) + `"}`

	res := c.do(http.MethodPost, "/notes", nil)
	res.Body.Close()

	req, err := http.NewRequest(http.MethodPost, app.srv.URL+"/api/notes",
		strings.NewReader(huge))
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(c.cookie)

	out, err := app.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("oversized POST: %v", err)
	}
	defer out.Body.Close()

	if out.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 — an unbounded body is a "+
			"memory-exhaustion primitive", out.StatusCode)
	}
}
