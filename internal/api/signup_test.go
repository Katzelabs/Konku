package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

// Signup and verification (07 L3).
//
// The two properties this file exists for are the ones L3 names as its
// acceptance: signing up twice with the same address must not reveal that the
// first one exists, and an unverified account must not be able to read or
// write anything.

const signupPassword = "correct-horse-battery-staple"

// errMailDown stands in for a provider outage.
var errMailDown = errors.New("smtp: provider unavailable")

// errBody is the one error shape every endpoint returns (D-040).
type errBody struct {
	Error struct {
		Code      string `json:"code"`
		Message   string `json:"message"`
		RequestID string `json:"request_id"`
	} `json:"error"`
}

type userBody struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"emailVerified"`
}

// redactRequestID removes the one field that legitimately differs between two
// otherwise identical error responses, so "these answer the same way" can be
// asserted on the whole body rather than on the status alone.
func redactRequestID(body string) string {
	var v map[string]any
	if err := json.Unmarshal([]byte(body), &v); err != nil {
		return body
	}
	if e, ok := v["error"].(map[string]any); ok {
		delete(e, "request_id")
	}
	out, err := json.Marshal(v)
	if err != nil {
		return body
	}
	return string(out)
}

// post sends an unauthenticated JSON request, which is what every route in
// this file is. The testClient helper cannot be used: these run before there
// is a session to carry.
func post(t *testing.T, a *testApp, path string, body any) *http.Response {
	t.Helper()

	buf, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encoding request: %v", err)
	}
	res, err := a.srv.Client().Post(a.srv.URL+"/api"+path, "application/json", bytes.NewReader(buf))
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}

func statusOf(t *testing.T, res *http.Response) (int, string) {
	t.Helper()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	return res.StatusCode, string(raw)
}

// signupAddress returns a fresh address and removes the account afterwards, so
// the shared dev database is left as it was found.
func signupAddress(t *testing.T, a *testApp) string {
	t.Helper()
	email := "signup-" + uuid.NewString() + "@example.com"
	t.Cleanup(func() {
		_, _ = a.store.Pool().Exec(context.Background(),
			"DELETE FROM users WHERE email = $1", email)
	})
	return email
}

// scopedCount runs a count inside a transaction that has app.user_id set, which
// is the only way a query against an RLS-protected table sees anything. The
// testClient helper does the same thing; these tests have no client because the
// account under test has not verified yet.
func scopedCount(t *testing.T, a *testApp, userID uuid.UUID, sql string, dst *int) error {
	t.Helper()

	tx, err := a.store.Pool().Begin(a.ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(a.ctx) }()

	if _, err := tx.Exec(a.ctx,
		"select set_config('app.user_id', $1, true)", userID.String()); err != nil {
		return err
	}
	return tx.QueryRow(a.ctx, sql, userID).Scan(dst)
}

// The acceptance criterion, stated directly.
//
// A signup form that answers differently for a taken address is an
// account-existence oracle for every address an attacker cares to type. The
// status, the body and the fact that no second mail goes out all have to match.
func TestSignupDoesNotLeakThatTheAddressExists(t *testing.T) {
	a := newApp(t)
	email := signupAddress(t, a)

	firstStatus, firstBody := statusOf(t, post(t, a, "/auth/signup",
		map[string]string{"email": email, "password": signupPassword}))
	if firstStatus != http.StatusNoContent {
		t.Fatalf("first signup status = %d, want 204: %s", firstStatus, firstBody)
	}

	secondStatus, secondBody := statusOf(t, post(t, a, "/auth/signup",
		map[string]string{"email": email, "password": signupPassword}))

	if secondStatus != firstStatus {
		t.Errorf("second signup status = %d, first was %d; the difference tells "+
			"an attacker the address is registered", secondStatus, firstStatus)
	}
	if secondBody != firstBody {
		t.Errorf("second signup body = %q, first was %q", secondBody, firstBody)
	}

	// The quieter half of the leak: a second message arriving would tell the
	// *account holder* that someone guessed their address, and would make the
	// endpoint a mailbomb with no rate limit on the interesting axis.
	if n := a.mail.countTo(email); n != 1 {
		t.Errorf("%d messages sent for two signups, want exactly 1", n)
	}
}

// The other acceptance criterion. An account that has not confirmed its
// address can hold a session — it needs one to see the "check your mail"
// screen — but every route that touches stored content must refuse it.
func TestUnverifiedAccountCannotReadOrWriteAnything(t *testing.T) {
	a := newApp(t)
	email := signupAddress(t, a)

	if status, body := statusOf(t, post(t, a, "/auth/signup",
		map[string]string{"email": email, "password": signupPassword})); status != http.StatusNoContent {
		t.Fatalf("signup status = %d, want 204: %s", status, body)
	}

	res := login(t, a.srv, email, signupPassword)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d; an unverified account must still be able to "+
			"sign in, or it cannot be told why nothing works", res.StatusCode)
	}
	cookie := sessionCookie(t, res)

	var me userBody
	if err := json.NewDecoder(res.Body).Decode(&me); err != nil {
		t.Fatalf("decoding login response: %v", err)
	}
	if me.EmailVerified {
		t.Error("a freshly signed-up account reports emailVerified = true")
	}

	// One per route family, method included, so a new group added outside
	// requireVerified is caught rather than assumed.
	blocked := []struct{ method, path string }{
		{http.MethodGet, "/notes"},
		{http.MethodPost, "/notes"},
		{http.MethodGet, "/cards"},
		{http.MethodGet, "/categories"},
		{http.MethodGet, "/review/due"},
		{http.MethodGet, "/sessions"},
		{http.MethodPost, "/sessions"},
		{http.MethodGet, "/exams"},
		{http.MethodGet, "/domains"},
	}

	for _, b := range blocked {
		t.Run(b.method+" "+b.path, func(t *testing.T) {
			req, err := http.NewRequest(b.method, a.srv.URL+"/api"+b.path, bytes.NewReader([]byte("{}")))
			if err != nil {
				t.Fatalf("building request: %v", err)
			}
			req.Header.Set("Content-Type", "application/json")
			req.AddCookie(cookie)

			res, err := a.srv.Client().Do(req)
			if err != nil {
				t.Fatalf("%s %s: %v", b.method, b.path, err)
			}
			defer res.Body.Close()

			if res.StatusCode != http.StatusForbidden {
				t.Fatalf("status = %d, want 403 — an unverified account reached %s %s",
					res.StatusCode, b.method, b.path)
			}
			var body errBody
			if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
				t.Fatalf("decoding: %v", err)
			}
			// The client branches on this to show a resend button rather than
			// a generic permissions error.
			if body.Error.Code != "email_unverified" {
				t.Errorf("code = %q, want email_unverified", body.Error.Code)
			}
		})
	}
}

// Verification, and the whole of what a token guarantees.
func TestVerification(t *testing.T) {
	a := newApp(t)
	email := signupAddress(t, a)

	if status, body := statusOf(t, post(t, a, "/auth/signup",
		map[string]string{"email": email, "password": signupPassword})); status != http.StatusNoContent {
		t.Fatalf("signup status = %d, want 204: %s", status, body)
	}

	sent := a.mail.lastTo(t, email)
	if sent.kind != "verification" {
		t.Fatalf("sent a %q message, want verification", sent.kind)
	}
	if sent.token == "" {
		t.Fatal("the verification mail carried no token")
	}

	if status, body := statusOf(t, post(t, a, "/auth/verify",
		map[string]string{"token": sent.token})); status != http.StatusNoContent {
		t.Fatalf("verify status = %d, want 204: %s", status, body)
	}

	// Single-use. The claim is one UPDATE, so a replayed link finds nothing.
	status, _ := statusOf(t, post(t, a, "/auth/verify", map[string]string{"token": sent.token}))
	if status != http.StatusBadRequest {
		t.Errorf("replayed token status = %d, want 400 — the token is not single-use", status)
	}

	// And the account now works.
	res := login(t, a.srv, email, signupPassword)
	defer res.Body.Close()
	cookie := sessionCookie(t, res)

	req, _ := http.NewRequest(http.MethodGet, a.srv.URL+"/api/notes", nil)
	req.AddCookie(cookie)
	notes, err := a.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("GET /notes: %v", err)
	}
	defer notes.Body.Close()
	if notes.StatusCode != http.StatusOK {
		t.Errorf("GET /notes after verifying = %d, want 200", notes.StatusCode)
	}
}

// Unknown, malformed and spent tokens must be indistinguishable. A different
// answer for any of them tells an attacker which guesses were close.
func TestBadTokensAllFailIdentically(t *testing.T) {
	a := newApp(t)

	// A token that was issued and then spent, so this is not merely testing
	// "random string is rejected".
	email := signupAddress(t, a)
	if status, _ := statusOf(t, post(t, a, "/auth/signup",
		map[string]string{"email": email, "password": signupPassword})); status != http.StatusNoContent {
		t.Fatalf("signup failed")
	}
	spent := a.mail.lastTo(t, email).token
	if status, _ := statusOf(t, post(t, a, "/auth/verify", map[string]string{"token": spent})); status != http.StatusNoContent {
		t.Fatalf("first verify failed")
	}

	cases := map[string]string{
		"unknown":   "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
		"empty":     "",
		"malformed": "not-base64-!!!",
		"spent":     spent,
	}

	var first string
	var firstStatus int
	for name, token := range cases {
		status, body := statusOf(t, post(t, a, "/auth/verify", map[string]string{"token": token}))
		if first == "" {
			firstStatus, first = status, redactRequestID(body)
			continue
		}
		if status != firstStatus {
			t.Errorf("%s token status = %d, another kind gave %d", name, status, firstStatus)
		}
		if got := redactRequestID(body); got != first {
			t.Errorf("%s token body = %q, another kind gave %q", name, got, first)
		}
	}
}

// Resend is rate-limited by address, not only by IP.
//
// Per-IP alone lets an attacker mailbomb one victim from many hosts, which is
// the case the per-address limiter exists for (07 L3). The test drives one IP
// because that is all httptest offers — what it proves is that the address
// limiter trips before the per-IP one would matter.
func TestResendIsLimitedByAddress(t *testing.T) {
	a := newApp(t)
	email := signupAddress(t, a)

	if status, _ := statusOf(t, post(t, a, "/auth/signup",
		map[string]string{"email": email, "password": signupPassword})); status != http.StatusNoContent {
		t.Fatalf("signup failed")
	}

	// Signup already consumed one of the three sends allowed per address.
	limited := false
	for i := 0; i < 5; i++ {
		status, _ := statusOf(t, post(t, a, "/auth/resend-verification",
			map[string]string{"email": email}))
		if status == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Fatal("no 429 after six sends to one address; the per-address limiter is not working")
	}

	// The limiter must not be a mail-sending oracle either: an unknown address
	// answers the same 204 a real one does.
	unknown := "nobody-" + uuid.NewString() + "@example.com"
	if status, _ := statusOf(t, post(t, a, "/auth/resend-verification",
		map[string]string{"email": unknown})); status != http.StatusNoContent {
		t.Errorf("resend for an unknown address = %d, want 204", status)
	}
	if n := a.mail.countTo(unknown); n != 0 {
		t.Errorf("%d messages sent to an address that is not registered", n)
	}
}

// A signed-up account gets everything an account needs, in one transaction.
//
// A user with no domains opens onto an empty picker with nothing to repair it
// (D-046); a user with no settings row makes every read handle "missing" as a
// special case (07 L1).
func TestSignupSeedsDomainsAndSettings(t *testing.T) {
	a := newApp(t)
	email := signupAddress(t, a)

	if status, _ := statusOf(t, post(t, a, "/auth/signup",
		map[string]string{"email": email, "password": signupPassword})); status != http.StatusNoContent {
		t.Fatalf("signup failed")
	}

	var userID uuid.UUID
	if err := a.store.Pool().QueryRow(a.ctx,
		"SELECT id FROM users WHERE email = $1", email).Scan(&userID); err != nil {
		t.Fatalf("reading the new user: %v", err)
	}

	// Counted inside a user-scoped transaction, not on the bare pool.
	//
	// This is RLS doing its job rather than an inconvenience: domains and
	// user_settings carry the strict tenant policy, so a query with no
	// app.user_id set matches no rows at all and the count comes back 0
	// whether or not the seeding worked (D-059). users is readable here only
	// because its policy permits the unset case — it is the auth substrate,
	// read before there is an identity to scope by.
	var domains, settings int
	if err := scopedCount(t, a, userID, "SELECT count(*) FROM domains WHERE user_id = $1", &domains); err != nil {
		t.Fatalf("counting domains: %v", err)
	}
	if err := scopedCount(t, a, userID, "SELECT count(*) FROM user_settings WHERE user_id = $1", &settings); err != nil {
		t.Fatalf("counting settings: %v", err)
	}

	if domains != 5 {
		t.Errorf("%d starter domains, want 5", domains)
	}
	if settings != 1 {
		t.Errorf("%d settings rows, want exactly 1", settings)
	}
}

// Signup must still succeed when the provider is down.
//
// The account is committed before the send. Failing the request would tell the
// user signup did not work when it did — and their retry hits the taken-address
// path, which answers 204 and sends nothing. That is a dead end; a logged
// failure plus a working resend is the recoverable shape.
func TestSignupSucceedsWhenMailFails(t *testing.T) {
	a := newApp(t)
	email := signupAddress(t, a)

	a.mail.mu.Lock()
	a.mail.err = errMailDown
	a.mail.mu.Unlock()
	t.Cleanup(func() {
		a.mail.mu.Lock()
		a.mail.err = nil
		a.mail.mu.Unlock()
	})

	status, body := statusOf(t, post(t, a, "/auth/signup",
		map[string]string{"email": email, "password": signupPassword}))
	if status != http.StatusNoContent {
		t.Fatalf("status = %d, want 204 even with the transport down: %s", status, body)
	}

	var exists bool
	if err := a.store.Pool().QueryRow(a.ctx,
		"SELECT exists(SELECT 1 FROM users WHERE email = $1)", email).Scan(&exists); err != nil {
		t.Fatalf("checking the account: %v", err)
	}
	if !exists {
		t.Error("the account was not created; a failed send must not roll it back")
	}
}

// Signup rejects what it should before it touches the database.
func TestSignupValidation(t *testing.T) {
	a := newApp(t)

	cases := []struct {
		name     string
		email    string
		password string
	}{
		{"no email", "", signupPassword},
		{"not an address", "nope", signupPassword},
		{"display-name form", "Someone <a@b.com>", signupPassword},
		{"two at signs", "a@b@c.com", signupPassword},
		{"short password", "someone-" + uuid.NewString() + "@example.com", "short"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, _ := statusOf(t, post(t, a, "/auth/signup",
				map[string]string{"email": tc.email, "password": tc.password}))
			if status != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", status)
			}
		})
	}
}
