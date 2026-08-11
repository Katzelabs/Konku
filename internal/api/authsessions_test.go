package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

// The active sessions screen (07 L5).

type authSessionBody struct {
	ID        string    `json:"id"`
	Current   bool      `json:"current"`
	CreatedAt time.Time `json:"createdAt"`
	LastSeen  time.Time `json:"lastSeen"`
	UserAgent string    `json:"userAgent"`
	IP        string    `json:"ip"`
}

// listAuthSessions reads the screen as a given session.
func listAuthSessions(t *testing.T, a *testApp, c *http.Cookie) []authSessionBody {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, a.srv.URL+"/api/auth/sessions", nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("User-Agent", "KonkuTest/1.0")
	req.AddCookie(c)

	res, err := a.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("GET /auth/sessions: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}

	var out []authSessionBody
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	return out
}

// loginAs signs in and returns the session cookie, sending a recognisable
// User-Agent so the row can be told apart on the screen.
func loginAs(t *testing.T, a *testApp, email, password, userAgent string) *http.Cookie {
	t.Helper()

	body := `{"email":"` + email + `","password":"` + password + `"}`
	req, err := http.NewRequest(http.MethodPost, a.srv.URL+"/api/auth/login", strings.NewReader(body))
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent)

	res, err := a.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, want 200", res.StatusCode)
	}
	return sessionCookie(t, res)
}

// L5's stated acceptance: revoking a session from one browser signs the other
// one out on its next request.
func TestRevokingASessionSignsTheOtherBrowserOut(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	other := loginAs(t, a, c.email, testPassword, "OtherBrowser/2.0")

	if got := statusWithCookie(t, a, http.MethodGet, "/notes", other); got != http.StatusOK {
		t.Fatalf("the second session = %d before revoking, want 200", got)
	}

	sessions := listAuthSessions(t, a, c.cookie)
	var target string
	for _, s := range sessions {
		if !s.Current {
			target = s.ID
		}
	}
	if target == "" {
		t.Fatalf("no other session in the list; got %d row(s)", len(sessions))
	}

	if got := deleteAuthSession(t, a, c.cookie, target); got != http.StatusNoContent {
		t.Fatalf("revoke status = %d, want 204", got)
	}

	if got := statusWithCookie(t, a, http.MethodGet, "/notes", other); got != http.StatusUnauthorized {
		t.Errorf("the revoked session = %d on its next request, want 401", got)
	}
	// And the one that did the revoking is untouched.
	if got := statusWithCookie(t, a, http.MethodGet, "/notes", c.cookie); got != http.StatusOK {
		t.Errorf("the revoking session = %d, want 200 — it revoked the wrong row", got)
	}
}

// The tenancy test, which is the one that is not negotiable (D-039).
func TestAuthSessionsAreScoped(t *testing.T) {
	a := newApp(t)
	alice := a.newClient(t)
	bob := a.newClient(t)

	rows := listAuthSessions(t, a, alice.cookie)
	if len(rows) == 0 {
		t.Fatal("alice has no sessions")
	}

	// Bob must not see Alice's, and must not be able to revoke one.
	for _, s := range listAuthSessions(t, a, bob.cookie) {
		for _, own := range rows {
			if s.ID == own.ID {
				t.Fatal("bob's session list contains one of alice's sessions")
			}
		}
	}

	if got := deleteAuthSession(t, a, bob.cookie, rows[0].ID); got != http.StatusNotFound {
		t.Errorf("bob revoking alice's session = %d, want 404 — never 403, or the "+
			"API can be used to probe for other accounts' sessions", got)
	}
	// And it really is still alive.
	if got := statusWithCookie(t, a, http.MethodGet, "/notes", alice.cookie); got != http.StatusOK {
		t.Error("bob revoked alice's session")
	}
}

// The session id is the credential (D-039). If it ever appears in this
// response, every live session of the account is readable by any script on the
// page and HttpOnly stops meaning anything.
func TestTheSessionListNeverCarriesTheCredential(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	req, err := http.NewRequest(http.MethodGet, a.srv.URL+"/api/auth/sessions", nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.AddCookie(c.cookie)

	res, err := a.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("GET /auth/sessions: %v", err)
	}
	defer res.Body.Close()

	var raw json.RawMessage
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if bytes.Contains(raw, []byte(c.cookie.Value)) {
		t.Fatal("the response body contains the raw session id")
	}
}

func TestSessionListShowsTheClientAndMarksTheCurrentOne(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)
	_ = loginAs(t, a, c.email, testPassword, "OtherBrowser/2.0")

	rows := listAuthSessions(t, a, c.cookie)
	if len(rows) < 2 {
		t.Fatalf("%d session(s), want at least 2", len(rows))
	}

	current := 0
	var sawOther bool
	for _, s := range rows {
		if s.Current {
			current++
		}
		if s.UserAgent == "OtherBrowser/2.0" {
			sawOther = true
			if s.Current {
				t.Error("the other browser's session is marked current")
			}
		}
		if s.IP == "" {
			t.Errorf("session %s has no IP; the screen cannot answer "+
				"'do I recognise this' without one", s.ID)
		}
	}
	if current != 1 {
		t.Errorf("%d sessions marked current, want exactly 1", current)
	}
	if !sawOther {
		t.Error("the second login's User-Agent was not recorded")
	}
}

// "Sign out everywhere else" has to leave the caller signed in, or they cannot
// see that it worked.
func TestRevokeOthersKeepsTheCurrentSession(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	first := loginAs(t, a, c.email, testPassword, "First/1.0")
	second := loginAs(t, a, c.email, testPassword, "Second/1.0")

	req, err := http.NewRequest(http.MethodDelete, a.srv.URL+"/api/auth/sessions", nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.AddCookie(c.cookie)
	res, err := a.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("DELETE /auth/sessions: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.StatusCode)
	}

	if got := statusWithCookie(t, a, http.MethodGet, "/notes", c.cookie); got != http.StatusOK {
		t.Errorf("the calling session = %d, want 200 — it signed itself out", got)
	}
	for name, cookie := range map[string]*http.Cookie{"first": first, "second": second} {
		if got := statusWithCookie(t, a, http.MethodGet, "/notes", cookie); got != http.StatusUnauthorized {
			t.Errorf("%s session = %d, want 401", name, got)
		}
	}

	if rows := listAuthSessions(t, a, c.cookie); len(rows) != 1 {
		t.Errorf("%d sessions remain, want 1", len(rows))
	}
}

// A handle that is not a uuid answers exactly like one that belongs to someone
// else. A 400 for the malformed case would separate "not a handle" from "not
// yours", which is the difference an enumerator is looking for.
func TestUnparseableSessionHandleIsNotFound(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	if got := deleteAuthSession(t, a, c.cookie, "not-a-uuid"); got != http.StatusNotFound {
		t.Errorf("status = %d, want 404", got)
	}
	if got := deleteAuthSession(t, a, c.cookie, uuid.NewString()); got != http.StatusNotFound {
		t.Errorf("unknown handle status = %d, want 404", got)
	}
}

func deleteAuthSession(t *testing.T, a *testApp, c *http.Cookie, id string) int {
	t.Helper()

	req, err := http.NewRequest(http.MethodDelete, a.srv.URL+"/api/auth/sessions/"+id, nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.AddCookie(c)

	res, err := a.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("DELETE /auth/sessions/%s: %v", id, err)
	}
	defer res.Body.Close()
	return res.StatusCode
}
