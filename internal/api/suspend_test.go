package api_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/auth"
)

// Suspending an account (ticket 10, O1).
//
// These assert behaviour rather than wiring, which is the only kind of test
// worth having here: the login rate limiter shipped broken precisely because
// nothing ever asked for a 429. So every test below drives the real server
// over HTTP and asks what a suspended person actually gets back.

// setSuspendedDirectly writes users.suspended_at without going through
// auth.Suspend, and that is the point.
//
// auth.Suspend also revokes the account's sessions, so a test that used it
// could never reach requireNotSuspended — the request would fail at
// requireUser with a 401 instead, and the middleware would go untested while
// the suite stayed green. This writes only the column, which is exactly the
// state the middleware exists for: a suspension whose revocation did not
// happen, or a session minted some other way (hard rule 9's second mechanism).
//
// On the bare pool, like the account cleanup in newClient: the users policy
// permits when app.user_id is unset, which is the auth path's documented hole
// (00006) and is what a test standing outside any request has.
func setSuspendedDirectly(t *testing.T, a *testApp, userID uuid.UUID, at *time.Time) {
	t.Helper()

	if _, err := a.store.Pool().Exec(context.Background(),
		"UPDATE users SET suspended_at = $2 WHERE id = $1", userID, at); err != nil {
		t.Fatalf("setting suspended_at: %v", err)
	}
}

// suspendedNow is a pointer to "now", which is what the column takes.
func suspendedNow() *time.Time {
	t := time.Now()
	return &t
}

// The gate itself: nothing that touches stored content is reachable, and the
// two routes that report the caller's own state still are.
func TestSuspendedAccountCannotReachAnyDataRoute(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	// The account works before it is suspended. Without this the test could
	// pass against a server that was broken for everybody.
	c.expect(c.do(http.MethodGet, "/notes", nil), http.StatusOK, nil)

	setSuspendedDirectly(t, a, c.userID, suspendedNow())

	// One per route family, method included, so a group added outside
	// requireNotSuspended is caught rather than assumed — the same list shape
	// the unverified test uses, for the same reason.
	blocked := []struct{ method, path string }{
		{http.MethodGet, "/notes"},
		{http.MethodPost, "/notes"},
		{http.MethodGet, "/cards"},
		{http.MethodPost, "/cards"},
		{http.MethodGet, "/categories"},
		{http.MethodGet, "/domains"},
		{http.MethodGet, "/review/due"},
		{http.MethodGet, "/review/sets"},
		{http.MethodGet, "/sessions"},
		{http.MethodPost, "/sessions"},
		{http.MethodGet, "/settings"},
		{http.MethodGet, "/export"},
		{http.MethodGet, "/auth/sessions"},
	}

	for _, b := range blocked {
		t.Run(b.method+" "+b.path, func(t *testing.T) {
			res := c.do(b.method, b.path, nil)
			if res.StatusCode != http.StatusForbidden {
				t.Fatalf("status = %d, want 403 — a suspended account reached %s %s",
					res.StatusCode, b.method, b.path)
			}

			var body errBody
			if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
				t.Fatalf("decoding: %v", err)
			}
			// The code, not the message: a client that cannot tell this from
			// email_unverified offers a resend button to somebody it will not
			// help.
			if body.Error.Code != "account_suspended" {
				t.Errorf("code = %q, want account_suspended", body.Error.Code)
			}
			if body.Error.Message == "" {
				t.Error("the suspension carries no message; there is nothing for a screen to show")
			}
		})
	}

	// Deliberately still reachable. Without these a suspended person cannot
	// read their own state or sign out of it, which is the same reasoning that
	// keeps them outside requireVerified.
	t.Run("GET /auth/me still answers", func(t *testing.T) {
		c.expect(c.do(http.MethodGet, "/auth/me", nil), http.StatusOK, nil)
	})
	t.Run("POST /auth/logout still works", func(t *testing.T) {
		c.expect(c.do(http.MethodPost, "/auth/logout", nil), http.StatusNoContent, nil)
	})
}

// Lifting it puts the account back. A mechanism that can be applied and not
// lifted is one nobody dares use.
func TestLiftingASuspensionRestoresEveryRoute(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	setSuspendedDirectly(t, a, c.userID, suspendedNow())
	if res := c.do(http.MethodGet, "/notes", nil); res.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 while suspended", res.StatusCode)
	}

	setSuspendedDirectly(t, a, c.userID, nil)

	// The same session, unchanged: the gate reads the users row on every
	// request, so nothing has to be re-issued for the account to work again.
	c.expect(c.do(http.MethodGet, "/notes", nil), http.StatusOK, nil)
	c.expect(c.do(http.MethodPost, "/notes", map[string]any{
		"title": "kembali", "contentMd": "catatan setelah penangguhan dicabut",
	}), http.StatusCreated, nil)
}

// What the operator's command actually does: stops the open sessions and shuts
// the front door, then hands the account back.
func TestSuspendRevokesSessionsAndRefusesLogin(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	id, since, err := a.auth.Suspend(a.ctx, c.email)
	if err != nil {
		t.Fatalf("suspending: %v", err)
	}
	if id != c.userID {
		t.Fatalf("suspended %s, want %s", id, c.userID)
	}
	if since.IsZero() {
		t.Error("suspension came back with no timestamp; 'since when' is the one fact the column carries")
	}

	// The live session is gone, so the browser tab stops working now rather
	// than at its next full page load. 401 and not 403: there is no session
	// left to be suspended.
	if res := c.do(http.MethodGet, "/notes", nil); res.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 — suspending left a live session behind", res.StatusCode)
	}

	// And they cannot simply sign in again.
	res := login(t, a.srv, c.email, testPassword)
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("login status = %d, want 403 for a suspended account", res.StatusCode)
	}
	for _, cookie := range res.Cookies() {
		if cookie.Value != "" && (cookie.Name == "konku_session" || cookie.Name == "__Host-konku_session") {
			t.Fatal("a refused login still set a session cookie")
		}
	}

	var body errBody
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if body.Error.Code != "account_suspended" {
		t.Errorf("code = %q, want account_suspended", body.Error.Code)
	}

	// Idempotent: re-running the command during an incident is normal, and it
	// must not rewrite when the suspension happened.
	_, again, err := a.auth.Suspend(a.ctx, c.email)
	if err != nil {
		t.Fatalf("suspending twice: %v", err)
	}
	if !again.Equal(since) {
		t.Errorf("suspended_at moved from %s to %s on a second suspend", since, again)
	}

	// The way back.
	if _, err := a.auth.Unsuspend(a.ctx, c.email); err != nil {
		t.Fatalf("unsuspending: %v", err)
	}
	back := login(t, a.srv, c.email, testPassword)
	defer back.Body.Close()
	if back.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d after lifting the suspension, want 200", back.StatusCode)
	}
	cookie := sessionCookie(t, back)

	req, err := http.NewRequest(http.MethodGet, a.srv.URL+"/api/notes", nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.AddCookie(cookie)
	notes, err := a.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("GET /notes: %v", err)
	}
	defer notes.Body.Close()
	if notes.StatusCode != http.StatusOK {
		t.Errorf("status = %d after lifting the suspension, want 200", notes.StatusCode)
	}
}

// A wrong password on a suspended account is still just a wrong password.
//
// Order matters in auth.Login: answering "suspended" before verifying the
// password would turn the login form into an oracle for which addresses exist
// and which of them the operator has acted on — the leak the single
// "email atau kata sandi salah" exists to close (D-058).
func TestSuspensionIsNotRevealedBeforeThePasswordIsVerified(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	if _, _, err := a.auth.Suspend(a.ctx, c.email); err != nil {
		t.Fatalf("suspending: %v", err)
	}

	res := login(t, a.srv, c.email, "kata sandi yang salah sekali")
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 — a wrong password on a suspended account "+
			"must answer exactly like a wrong password anywhere else", res.StatusCode)
	}

	var body errBody
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if body.Error.Code == "account_suspended" {
		t.Error("a wrong password revealed that the account is suspended")
	}
}

// Suspension is one account, not a neighbourhood. The tenancy shape of this
// feature: A's suspension is invisible to B, in both directions (D-039).
func TestSuspendingOneAccountLeavesTheOtherAlone(t *testing.T) {
	a := newApp(t)
	victim := a.newClient(t)
	bystander := a.newClient(t)

	setSuspendedDirectly(t, a, victim.userID, suspendedNow())

	if res := victim.do(http.MethodGet, "/notes", nil); res.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 for the suspended account", res.StatusCode)
	}

	bystander.expect(bystander.do(http.MethodGet, "/notes", nil), http.StatusOK, nil)
	bystander.expect(bystander.do(http.MethodPost, "/notes", map[string]any{
		"title": "tidak terpengaruh", "contentMd": "akun lain ditangguhkan",
	}), http.StatusCreated, nil)

	res := login(t, a.srv, bystander.email, testPassword)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Errorf("login status = %d for an account nobody suspended, want 200", res.StatusCode)
	}
}

// The one expected failure of the operator command, and the one thing its
// error must not contain.
func TestSuspendingAnUnknownAddress(t *testing.T) {
	a := newApp(t)

	missing := "tidak-ada-" + uuid.NewString() + "@example.com"
	if _, _, err := a.auth.Suspend(a.ctx, missing); !errors.Is(err, auth.ErrNoAccount) {
		t.Fatalf("error = %v, want ErrNoAccount", err)
	}
	if _, err := a.auth.Unsuspend(a.ctx, missing); !errors.Is(err, auth.ErrNoAccount) {
		t.Fatalf("error = %v, want ErrNoAccount", err)
	}

	// The CLI hands a failed subcommand to slog, so an address in this string
	// is an address in a log line (hard rule 10, D-062).
	if got := auth.ErrNoAccount.Error(); got == "" || strings.Contains(got, "@") {
		t.Errorf("ErrNoAccount carries an address: %q", got)
	}
}
