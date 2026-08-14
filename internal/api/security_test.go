package api_test

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/config"
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
		// The two isolation headers CSP does not cover: frame-ancestors stops
		// this document being framed, and these stop it reaching, and being
		// reached by, another origin the other way round.
		{"Cross-Origin-Opener-Policy", "same-origin"},
		{"Cross-Origin-Resource-Policy", "same-origin"},
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

// The session cookie carries the __Host- prefix outside dev.
//
// The prefix is enforced by the browser, not the server: it refuses to store
// the cookie unless it is Secure, Path=/ and carries no Domain. What that buys
// is a sibling host being unable to overwrite this session, which matters
// because katzeapps.com is shared across projects (D-068).
//
// Asserted against a non-dev server specifically, because dev is the one
// configuration where the prefix cannot be used — Secure is off so
// http://localhost works, and a __Host- cookie without Secure is one the
// browser silently declines to store. A test that only ever ran in dev would
// assert the fallback forever and never see the real thing.
func TestSessionCookieUsesHostPrefixOutsideDev(t *testing.T) {
	app := newAppWith(t, config.Config{SessionTTL: time.Hour, AllowSignup: true})

	email := "api-" + uuid.NewString() + "@example.com"
	user, err := app.auth.CreateUser(app.ctx, email, testPassword)
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = app.store.Pool().Exec(context.Background(), "DELETE FROM users WHERE id = $1", user.ID)
	})

	res := login(t, app.srv, email, testPassword)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, want 200", res.StatusCode)
	}

	var c *http.Cookie
	for _, got := range res.Cookies() {
		if got.Value != "" {
			c = got
		}
	}
	if c == nil {
		t.Fatal("login set no session cookie")
	}

	if c.Name != "__Host-konku_session" {
		t.Errorf("cookie name = %q, want __Host-konku_session", c.Name)
	}
	// Each of these is a condition the prefix requires. A cookie that fails any
	// one of them is not stored at all, so getting the name right and an
	// attribute wrong is worse than not renaming it: login simply stops.
	if !c.Secure {
		t.Error("cookie is not Secure — a __Host- cookie without Secure is rejected by the browser")
	}
	if c.Path != "/" {
		t.Errorf("cookie Path = %q, want / — required by the prefix", c.Path)
	}
	if c.Domain != "" {
		t.Errorf("cookie Domain = %q, want empty — a Domain attribute voids the prefix", c.Domain)
	}
}

// The rename must not sign existing sessions out, and logout must still end
// one that was issued under the old name.
func TestBothCookieNamesAreAccepted(t *testing.T) {
	app := newApp(t) // dev, so the server writes the unprefixed name
	c := app.newClient(t)

	// The same credential presented under the other name still resolves. The
	// value is an opaque server-side id either way, so the name is addressing,
	// not authority.
	req, err := http.NewRequest(http.MethodGet, app.srv.URL+"/api/auth/me", nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.AddCookie(&http.Cookie{Name: "__Host-konku_session", Value: c.cookie.Value})

	res, err := app.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("GET /auth/me: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d under the prefixed name, want 200 — the rename "+
			"signed out every existing session", res.StatusCode)
	}

	// Logout expires both names, so a browser holding either is cleared.
	out := c.do(http.MethodPost, "/auth/logout", nil)
	defer out.Body.Close()

	cleared := map[string]bool{}
	for _, got := range out.Cookies() {
		if got.MaxAge < 0 {
			cleared[got.Name] = true
		}
	}
	for _, name := range []string{"konku_session", "__Host-konku_session"} {
		if !cleared[name] {
			t.Errorf("logout did not expire %q; a browser holding it would keep "+
				"presenting a credential after signing out", name)
		}
	}
}
