package api_test

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
)

// Account deletion (07 L7).
//
// L7's acceptance is unusually checkable: "a deleted account's email can sign
// up again, and no row referencing the old user_id remains". Both clauses are
// tests below, and the second one is checked against every table that carries
// a user_id rather than against a list somebody maintains — the same shape as
// TestEveryUserTableIsProtected, and for the same reason.

// deleteAccount posts the confirmation and returns the status.
func deleteAccount(t *testing.T, c *testClient, password string) int {
	t.Helper()
	res := c.do(http.MethodDelete, "/account", map[string]string{"password": password})
	return res.StatusCode
}

// The first clause, and the one that proves the delete is not soft: a
// tombstoned row would hold the unique constraint on the address forever.
func TestADeletedAccountsEmailCanSignUpAgain(t *testing.T) {
	a := newApp(t)
	email := signedUpUser(t, a)

	res := login(t, a.srv, email, signupPassword)
	defer res.Body.Close()
	cookie := sessionCookie(t, res)
	c := &testClient{t: t, app: a, cookie: cookie, email: email}

	if got := deleteAccount(t, c, signupPassword); got != http.StatusNoContent {
		t.Fatalf("delete status = %d, want 204", got)
	}

	// The address is free. Signing up with it must genuinely create an
	// account, not answer 204 because the address is taken (07 L3).
	if status, body := statusOf(t, post(t, a, "/auth/signup",
		signupBody(email))); status != http.StatusNoContent {
		t.Fatalf("signup after deletion = %d: %s", status, body)
	}

	var exists bool
	if err := a.store.Pool().QueryRow(a.ctx,
		"SELECT exists(SELECT 1 FROM users WHERE email = $1)", email).Scan(&exists); err != nil {
		t.Fatalf("checking the new account: %v", err)
	}
	if !exists {
		t.Error("signing up after deletion did not create an account; the old " +
			"row is still holding the address")
	}
}

// The second clause, checked against the schema rather than against a list.
func TestDeletionLeavesNoRowBehind(t *testing.T) {
	a := newApp(t)
	email := signedUpUser(t, a)

	res := login(t, a.srv, email, signupPassword)
	defer res.Body.Close()
	cookie := sessionCookie(t, res)

	var userID string
	if err := a.store.Pool().QueryRow(a.ctx,
		"SELECT id FROM users WHERE email = $1", email).Scan(&userID); err != nil {
		t.Fatalf("reading the user: %v", err)
	}
	c := &testClient{t: t, app: a, cookie: cookie, email: email, userID: uuid.MustParse(userID)}

	// Give the account rows in as many tables as possible, so "no rows remain"
	// is a claim about something rather than about an empty account.
	seedEverything(t, c)

	if got := deleteAccount(t, c, signupPassword); got != http.StatusNoContent {
		t.Fatalf("delete status = %d, want 204", got)
	}

	// Every table with a user_id, discovered from the catalogue. A table added
	// later without a cascade fails here rather than leaving rows nobody looks
	// at again.
	rows, err := a.store.Pool().Query(a.ctx, `
		SELECT table_name FROM information_schema.columns
		WHERE table_schema = 'public' AND column_name = 'user_id'
		ORDER BY table_name`)
	if err != nil {
		t.Fatalf("listing user tables: %v", err)
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scanning: %v", err)
		}
		tables = append(tables, name)
	}
	rows.Close()
	if len(tables) < 16 {
		t.Fatalf("only %d tables carry user_id; the query is not seeing the schema", len(tables))
	}

	for _, table := range tables {
		var n int
		// On the bare pool, not a user transaction: after the delete there is
		// no user to scope by, and this has to see rows that RLS would hide.
		// The users policy permits the unset case, and the owner connection is
		// not needed because nothing should be there to read.
		if err := a.store.Pool().QueryRow(a.ctx,
			"SELECT count(*) FROM "+table+" WHERE user_id = $1", userID).Scan(&n); err != nil {
			t.Fatalf("counting %s: %v", table, err)
		}
		if n != 0 {
			t.Errorf("%s still has %d row(s) for the deleted account", table, n)
		}
	}

	var users int
	if err := a.store.Pool().QueryRow(a.ctx,
		"SELECT count(*) FROM users WHERE id = $1", userID).Scan(&users); err != nil {
		t.Fatalf("counting users: %v", err)
	}
	if users != 0 {
		t.Error("the users row survived; the delete is soft after all")
	}
}

// A session is enough authority to read and write notes. It is not enough to
// destroy the account, and the gap matters most on a borrowed laptop.
func TestDeletionRequiresThePassword(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	if got := deleteAccount(t, c, "kata sandi yang salah"); got != http.StatusUnauthorized {
		t.Errorf("wrong password = %d, want 401", got)
	}
	if got := deleteAccount(t, c, ""); got != http.StatusBadRequest {
		t.Errorf("empty password = %d, want 400", got)
	}

	// And the account is untouched, or the refusal above meant nothing.
	if got := statusWithCookie(t, a, http.MethodGet, "/notes", c.cookie); got != http.StatusOK {
		t.Errorf("GET /notes = %d after a refused deletion, want 200", got)
	}
}

// Everything the account was signed in on dies with it, because the sessions
// cascade. The caller's own cookie is cleared so the browser lands on the
// login screen rather than on an error it did not cause.
func TestDeletionEndsEverySession(t *testing.T) {
	a := newApp(t)
	email := signedUpUser(t, a)

	first := loginAs(t, a, email, signupPassword, "First/1.0")
	second := loginAs(t, a, email, signupPassword, "Second/1.0")
	c := &testClient{t: t, app: a, cookie: first, email: email}

	if got := deleteAccount(t, c, signupPassword); got != http.StatusNoContent {
		t.Fatalf("delete status = %d, want 204", got)
	}

	for name, cookie := range map[string]*http.Cookie{"first": first, "second": second} {
		if got := statusWithCookie(t, a, http.MethodGet, "/notes", cookie); got != http.StatusUnauthorized {
			t.Errorf("%s session = %d after deletion, want 401", name, got)
		}
	}
}

// One account's deletion must not touch another's. The cascade reaches a lot
// of tables, so a mistake here is the largest possible one.
func TestDeletionIsScopedToTheAccount(t *testing.T) {
	a := newApp(t)
	bystander := a.newClient(t)
	bystander.createNote(map[string]any{"title": "Masih ada", "contentMd": "jangan hilang"})

	email := signedUpUser(t, a)
	res := login(t, a.srv, email, signupPassword)
	defer res.Body.Close()
	doomed := &testClient{t: t, app: a, cookie: sessionCookie(t, res), email: email}

	if got := deleteAccount(t, doomed, signupPassword); got != http.StatusNoContent {
		t.Fatalf("delete status = %d, want 204", got)
	}

	if got := statusWithCookie(t, a, http.MethodGet, "/notes", bystander.cookie); got != http.StatusOK {
		t.Fatalf("the bystander's session = %d after another account was deleted", got)
	}
	var notes int
	if err := bystander.scanAs("SELECT count(*) FROM notes WHERE user_id = $1",
		[]any{bystander.userID}, &notes); err != nil {
		t.Fatalf("counting the bystander's notes: %v", err)
	}
	if notes == 0 {
		t.Error("deleting one account removed another account's notes")
	}
}
