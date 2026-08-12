package api_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Password reset (07 L4).
//
// L4's acceptance is a single sentence with four clauses: a used token fails,
// an expired token fails, a token for another account fails, and all three fail
// identically from the client's point of view. TestResetTokensAllFailIdentically
// is that sentence.

const newPassword = "kata-sandi-yang-baru-sekali"

// signedUpUser creates a verified account through the API and returns its
// address. Reset is about accounts that already exist and already work.
func signedUpUser(t *testing.T, a *testApp) string {
	t.Helper()

	email := signupAddress(t, a)
	if status, body := statusOf(t, post(t, a, "/auth/signup",
		signupBody(email))); status != http.StatusNoContent {
		t.Fatalf("signup status = %d: %s", status, body)
	}
	token := a.mail.lastTo(t, email).token
	if status, _ := statusOf(t, post(t, a, "/auth/verify",
		map[string]string{"token": token})); status != http.StatusNoContent {
		t.Fatal("verifying the new account failed")
	}
	return email
}

// requestReset asks for a link and returns the token that reached the mailbox.
func requestReset(t *testing.T, a *testApp, email string) string {
	t.Helper()

	if status, body := statusOf(t, post(t, a, "/auth/forgot",
		map[string]string{"email": email})); status != http.StatusNoContent {
		t.Fatalf("forgot status = %d, want 204: %s", status, body)
	}
	sent := a.mail.lastTo(t, email)
	if sent.kind != "reset" {
		t.Fatalf("sent a %q message, want reset", sent.kind)
	}
	return sent.token
}

// Forgot must not become a way to test which addresses have accounts.
func TestForgotDoesNotRevealWhetherTheAddressExists(t *testing.T) {
	a := newApp(t)
	email := signedUpUser(t, a)
	unknown := "nobody-" + uuid.NewString() + "@example.com"

	knownStatus, knownBody := statusOf(t, post(t, a, "/auth/forgot",
		map[string]string{"email": email}))
	unknownStatus, unknownBody := statusOf(t, post(t, a, "/auth/forgot",
		map[string]string{"email": unknown}))

	if knownStatus != http.StatusNoContent {
		t.Errorf("known address status = %d, want 204", knownStatus)
	}
	if unknownStatus != knownStatus {
		t.Errorf("unknown address status = %d, known gave %d", unknownStatus, knownStatus)
	}
	if unknownBody != knownBody {
		t.Errorf("unknown address body = %q, known gave %q", unknownBody, knownBody)
	}
	if n := a.mail.countTo(unknown); n != 0 {
		t.Errorf("%d messages sent to an address with no account", n)
	}
}

// L4's stated acceptance, in one test.
func TestResetTokensAllFailIdentically(t *testing.T) {
	a := newApp(t)

	// Used: issued, then spent on a successful reset.
	victim := signedUpUser(t, a)
	used := requestReset(t, a, victim)
	if status, body := statusOf(t, post(t, a, "/auth/reset",
		map[string]string{"token": used, "password": newPassword})); status != http.StatusNoContent {
		t.Fatalf("the first reset failed: %d %s", status, body)
	}

	// Expired: a real token for a real account, aged past its lifetime by
	// moving expires_at rather than by waiting an hour.
	other := signedUpUser(t, a)
	expired := requestReset(t, a, other)
	if _, err := a.store.Pool().Exec(a.ctx,
		`UPDATE auth_tokens SET expires_at = $1
		 WHERE user_id = (SELECT id FROM users WHERE email = $2) AND used_at IS NULL`,
		time.Now().Add(-time.Minute), other); err != nil {
		t.Fatalf("ageing the token: %v", err)
	}

	// Wrong kind: a genuine, live, unspent token that belongs to the
	// verification flow. It is "a token for another purpose" — the closest an
	// attacker gets to a valid one they were legitimately given.
	third := signupAddress(t, a)
	if status, _ := statusOf(t, post(t, a, "/auth/signup",
		signupBody(third))); status != http.StatusNoContent {
		t.Fatal("signup failed")
	}
	wrongKind := a.mail.lastTo(t, third).token

	cases := map[string]string{
		"used":       used,
		"expired":    expired,
		"wrong kind": wrongKind,
		"unknown":    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
	}

	var firstName, firstBody string
	var firstStatus int
	for name, token := range cases {
		status, body := statusOf(t, post(t, a, "/auth/reset",
			map[string]string{"token": token, "password": newPassword}))
		body = redactRequestID(body)

		if firstName == "" {
			firstName, firstStatus, firstBody = name, status, body
			if status != http.StatusBadRequest {
				t.Fatalf("%s token status = %d, want 400", name, status)
			}
			continue
		}
		if status != firstStatus {
			t.Errorf("%s token status = %d, %s gave %d", name, status, firstName, firstStatus)
		}
		if body != firstBody {
			t.Errorf("%s token body = %q, %s gave %q", name, body, firstName, firstBody)
		}
	}
}

// The point of the feature.
//
// A reset is what someone does when they think their account is compromised.
// One that leaves the attacker's session alive does nothing at all.
func TestResetRevokesEverySession(t *testing.T) {
	a := newApp(t)
	email := signedUpUser(t, a)

	// Two sessions, standing in for the user's own and an intruder's.
	first := login(t, a.srv, email, signupPassword)
	defer first.Body.Close()
	firstCookie := sessionCookie(t, first)

	second := login(t, a.srv, email, signupPassword)
	defer second.Body.Close()
	secondCookie := sessionCookie(t, second)

	// Both work beforehand, or the assertion afterwards proves nothing.
	for name, c := range map[string]*http.Cookie{"first": firstCookie, "second": secondCookie} {
		if got := statusWithCookie(t, a, http.MethodGet, "/notes", c); got != http.StatusOK {
			t.Fatalf("%s session = %d before the reset, want 200", name, got)
		}
	}

	token := requestReset(t, a, email)
	if status, body := statusOf(t, post(t, a, "/auth/reset",
		map[string]string{"token": token, "password": newPassword})); status != http.StatusNoContent {
		t.Fatalf("reset status = %d: %s", status, body)
	}

	for name, c := range map[string]*http.Cookie{"first": firstCookie, "second": secondCookie} {
		if got := statusWithCookie(t, a, http.MethodGet, "/notes", c); got != http.StatusUnauthorized {
			t.Errorf("%s session = %d after the reset, want 401 — a reset that "+
				"leaves a session alive does nothing", name, got)
		}
	}
}

// The new password works and the old one does not. Obvious, and the thing that
// would be most embarrassing to get wrong.
func TestResetChangesThePassword(t *testing.T) {
	a := newApp(t)
	email := signedUpUser(t, a)

	token := requestReset(t, a, email)
	if status, _ := statusOf(t, post(t, a, "/auth/reset",
		map[string]string{"token": token, "password": newPassword})); status != http.StatusNoContent {
		t.Fatal("reset failed")
	}

	old := login(t, a.srv, email, signupPassword)
	defer old.Body.Close()
	if old.StatusCode != http.StatusUnauthorized {
		t.Errorf("the old password still logs in: status = %d", old.StatusCode)
	}

	fresh := login(t, a.srv, email, newPassword)
	defer fresh.Body.Close()
	if fresh.StatusCode != http.StatusOK {
		t.Errorf("the new password does not log in: status = %d", fresh.StatusCode)
	}
}

// Clicking a link sent to an address proves control of that mailbox, which is
// exactly what the verification link proves. An account that completes a reset
// and is still locked out as unverified would be stuck with no way forward.
func TestResetAlsoVerifiesTheAddress(t *testing.T) {
	a := newApp(t)

	email := signupAddress(t, a)
	if status, _ := statusOf(t, post(t, a, "/auth/signup",
		signupBody(email))); status != http.StatusNoContent {
		t.Fatal("signup failed")
	}
	// Deliberately never verified.

	token := requestReset(t, a, email)
	if status, body := statusOf(t, post(t, a, "/auth/reset",
		map[string]string{"token": token, "password": newPassword})); status != http.StatusNoContent {
		t.Fatalf("reset status = %d: %s", status, body)
	}

	res := login(t, a.srv, email, newPassword)
	defer res.Body.Close()
	cookie := sessionCookie(t, res)
	if got := statusWithCookie(t, a, http.MethodGet, "/notes", cookie); got != http.StatusOK {
		t.Errorf("GET /notes = %d after a reset, want 200 — the reset proved "+
			"mailbox control and should have verified the address", got)
	}
}

// A rejected reset must not spend the token, or a transient failure leaves the
// user holding a dead link and their old password.
func TestARejectedResetLeavesTheTokenUsable(t *testing.T) {
	a := newApp(t)
	email := signedUpUser(t, a)
	token := requestReset(t, a, email)

	if status, _ := statusOf(t, post(t, a, "/auth/reset",
		map[string]string{"token": token, "password": "short"})); status != http.StatusBadRequest {
		t.Fatal("a too-short password was accepted")
	}

	if status, body := statusOf(t, post(t, a, "/auth/reset",
		map[string]string{"token": token, "password": newPassword})); status != http.StatusNoContent {
		t.Fatalf("the token was spent by a rejected attempt: %d %s", status, body)
	}
}

// statusWithCookie issues a request as a given session and returns the status.
func statusWithCookie(t *testing.T, a *testApp, method, path string, c *http.Cookie) int {
	t.Helper()

	req, err := http.NewRequestWithContext(context.Background(), method, a.srv.URL+"/api"+path, nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.AddCookie(c)

	res, err := a.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()
	return res.StatusCode
}
