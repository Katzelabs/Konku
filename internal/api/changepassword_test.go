package api_test

import (
	"net/http"
	"testing"

	"github.com/Katzelabs/Konku/internal/api"
)

// Changing the password from inside the app.
//
// The route did not exist before this: the only path to a new password was the
// forgot-password mail, which cannot work at all on an instance with no SMTP
// configured — and that is every instance where signup is closed and the one
// account came from `konku seed-user`.

// Distinct from reset_test.go's newPassword, so a test that changes a password
// cannot accidentally assert against the one the reset suite installs.
const changedPassword = "kata sandi baru yang panjang"

func changePassword(t *testing.T, c *testClient, current, next string) int {
	t.Helper()
	res := c.do(http.MethodPost, "/auth/password", map[string]string{
		"currentPassword": current,
		"newPassword":     next,
	})
	defer res.Body.Close()
	return res.StatusCode
}

func TestChangePassword(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	if got := changePassword(t, c, testPassword, changedPassword); got != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", got)
	}

	// The new password works.
	res := login(t, a.srv, c.email, changedPassword)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Errorf("login with the new password = %d, want 200", res.StatusCode)
	}

	// And the old one does not. Without this the test would pass for an
	// endpoint that answered 204 and wrote nothing.
	old := login(t, a.srv, c.email, testPassword)
	defer old.Body.Close()
	if old.StatusCode != http.StatusUnauthorized {
		t.Errorf("login with the old password = %d, want 401", old.StatusCode)
	}
}

// A session is authority to read and write notes. It is not authority to change
// the credential that outlives it — the borrowed-laptop case, same as deletion.
func TestChangePasswordRequiresTheCurrentOne(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	if got := changePassword(t, c, "kata sandi yang salah", changedPassword); got != http.StatusUnauthorized {
		t.Errorf("wrong current password = %d, want 401", got)
	}
	if got := changePassword(t, c, "", changedPassword); got != http.StatusBadRequest {
		t.Errorf("empty current password = %d, want 400", got)
	}

	// The password is untouched, or the refusals above meant nothing.
	res := login(t, a.srv, c.email, testPassword)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Errorf("the original password stopped working after refused changes (%d)", res.StatusCode)
	}
}

func TestChangePasswordValidatesTheNewOne(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	for _, tc := range []struct {
		name string
		next string
		want int
	}{
		{"too short", "pendek", http.StatusBadRequest},
		{"empty", "", http.StatusBadRequest},
		// Refused rather than accepted as a no-op: someone doing this believes
		// they have changed something, and the reason they are here is usually
		// that they think the old one is compromised.
		{"same as the current one", testPassword, http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := changePassword(t, c, testPassword, tc.next); got != tc.want {
				t.Errorf("status = %d, want %d", got, tc.want)
			}
		})
	}
}

// The half that makes this a security feature rather than a convenience: a new
// password that left the other sessions alive would leave whoever the change
// was aimed at still signed in.
func TestChangePasswordRevokesOtherSessionsButNotThisOne(t *testing.T) {
	a := newApp(t)
	email := signedUpUser(t, a)

	here := loginAs(t, a, email, signupPassword, "Here/1.0")
	elsewhere := loginAs(t, a, email, signupPassword, "Elsewhere/1.0")
	c := &testClient{t: t, app: a, cookie: here, email: email}

	if got := changePassword(t, c, signupPassword, changedPassword); got != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", got)
	}

	if got := statusWithCookie(t, a, http.MethodGet, "/notes", elsewhere); got != http.StatusUnauthorized {
		t.Errorf("the other session = %d after the change, want 401 — a password "+
			"change that leaves other sessions alive does not do what it is for", got)
	}
	// Signing the user out of the screen they just used reads as a bug rather
	// than as the feature working.
	if got := statusWithCookie(t, a, http.MethodGet, "/notes", here); got != http.StatusOK {
		t.Errorf("the calling session = %d after the change, want 200", got)
	}
}

// It takes a password, so guessing it has to be bounded — the same reasoning as
// DELETE /account, where the write limiter alone left 432.000 attempts a day.
func TestChangePasswordIsRateLimited(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	for i := range api.MaxPasswordChangesForTest {
		if got := changePassword(t, c, "kata sandi yang salah", changedPassword); got != http.StatusUnauthorized {
			t.Fatalf("attempt %d = %d, want 401", i+1, got)
		}
	}

	if got := changePassword(t, c, "kata sandi yang salah", changedPassword); got != http.StatusTooManyRequests {
		t.Errorf("attempt %d = %d, want 429", api.MaxPasswordChangesForTest+1, got)
	}
	// The correct password is refused too once the budget is spent. A limiter
	// that only counted failures would be reset by a lucky guess.
	if got := changePassword(t, c, testPassword, changedPassword); got != http.StatusTooManyRequests {
		t.Errorf("correct password after the budget = %d, want 429", got)
	}
}

// One account's password change must not touch another's.
func TestChangePasswordIsScopedToTheAccount(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)
	bystander := a.newClient(t)

	if got := changePassword(t, c, testPassword, changedPassword); got != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", got)
	}

	// The bystander's session and password both survive.
	if got := statusWithCookie(t, a, http.MethodGet, "/notes", bystander.cookie); got != http.StatusOK {
		t.Errorf("the bystander's session = %d after another account changed its "+
			"password, want 200", got)
	}
	res := login(t, a.srv, bystander.email, testPassword)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Errorf("the bystander's password = %d, want 200", res.StatusCode)
	}
}
