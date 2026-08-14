package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/api"
)

const testPassword = "kata sandi yang panjang"

// newTestServer is the auth tests' view of the app: a server and one user who
// has not signed in yet, because signing in is what these tests exercise.
func newTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()

	app := newApp(t)

	email := "api-" + uuid.NewString() + "@example.com"
	user, err := app.auth.CreateUser(app.ctx, email, testPassword)
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = app.store.Pool().Exec(context.Background(), "DELETE FROM users WHERE id = $1", user.ID)
	})

	return app.srv, email
}

func login(t *testing.T, srv *httptest.Server, email, password string) *http.Response {
	t.Helper()
	body := strings.NewReader(`{"email":"` + email + `","password":"` + password + `"}`)
	res, err := srv.Client().Post(srv.URL+"/api/auth/login", "application/json", body)
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	return res
}

// sessionCookie returns the session cookie under either name.
//
// Both, because the name depends on cfg.Dev: __Host- requires Secure, which dev
// turns off so http://localhost works. A helper that knew only one name would
// make every non-dev test fail on the helper rather than on what it asserts.
// Empty-valued cookies are skipped — logout expires both names at once, so a
// response can carry two.
func sessionCookie(t *testing.T, res *http.Response) *http.Cookie {
	t.Helper()
	for _, c := range res.Cookies() {
		if c.Value == "" {
			continue
		}
		if c.Name == "konku_session" || c.Name == "__Host-konku_session" {
			return c
		}
	}
	t.Fatal("no session cookie in response")
	return nil
}

func TestLoginFlow(t *testing.T) {
	srv, email := newTestServer(t)

	res := login(t, srv, email, testPassword)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, want 200", res.StatusCode)
	}

	cookie := sessionCookie(t, res)
	if !cookie.HttpOnly {
		t.Error("session cookie is not HttpOnly — JavaScript could read it")
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite = %v, want Lax", cookie.SameSite)
	}

	t.Run("me returns the user", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/auth/me", nil)
		req.AddCookie(cookie)
		got, err := srv.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer got.Body.Close()

		if got.StatusCode != http.StatusOK {
			t.Fatalf("me status = %d, want 200", got.StatusCode)
		}
		var body struct{ Email string }
		json.NewDecoder(got.Body).Decode(&body)
		if body.Email != email {
			t.Errorf("email = %q, want %q", body.Email, email)
		}
	})

	t.Run("bearer token works too", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/auth/me", nil)
		req.Header.Set("Authorization", "Bearer "+cookie.Value)
		got, err := srv.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer got.Body.Close()
		if got.StatusCode != http.StatusOK {
			t.Errorf("bearer status = %d, want 200 — MCP in v0.3 depends on this", got.StatusCode)
		}
	})

	t.Run("logout revokes the session", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/logout", nil)
		req.AddCookie(cookie)
		out, err := srv.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		out.Body.Close()

		// The same cookie must now be worthless. This is the whole reason
		// sessions are server-side rather than signed (D-039).
		req2, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/auth/me", nil)
		req2.AddCookie(cookie)
		after, err := srv.Client().Do(req2)
		if err != nil {
			t.Fatal(err)
		}
		defer after.Body.Close()
		if after.StatusCode != http.StatusUnauthorized {
			t.Errorf("status after logout = %d, want 401 — the session was not revoked", after.StatusCode)
		}
	})
}

func TestUnauthenticatedIsRejected(t *testing.T) {
	srv, _ := newTestServer(t)

	res, err := srv.Client().Get(srv.URL + "/api/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.StatusCode)
	}

	var body struct {
		Error struct{ Code, Message string }
	}
	json.NewDecoder(res.Body).Decode(&body)
	if body.Error.Code != api.CodeUnauthorized {
		t.Errorf("code = %q, want %q", body.Error.Code, api.CodeUnauthorized)
	}
	if body.Error.Message == "" {
		t.Error("no user-facing message")
	}
}

// Wrong password and unknown email must be indistinguishable, or the endpoint
// becomes an account-enumeration oracle.
func TestLoginFailuresAreIndistinguishable(t *testing.T) {
	srv, email := newTestServer(t)

	wrongPassword := login(t, srv, email, "definitely not the password")
	defer wrongPassword.Body.Close()
	unknownEmail := login(t, srv, "nobody-"+uuid.NewString()+"@example.com", testPassword)
	defer unknownEmail.Body.Close()

	if wrongPassword.StatusCode != unknownEmail.StatusCode {
		t.Errorf("status differs: wrong password %d, unknown email %d",
			wrongPassword.StatusCode, unknownEmail.StatusCode)
	}

	read := func(r *http.Response) string {
		var b struct {
			Error struct{ Code, Message string }
		}
		json.NewDecoder(r.Body).Decode(&b)
		return b.Error.Code + "|" + b.Error.Message
	}
	if a, b := read(wrongPassword), read(unknownEmail); a != b {
		t.Errorf("responses differ:\n  wrong password: %s\n  unknown email:  %s", a, b)
	}

	if len(wrongPassword.Cookies()) != 0 {
		t.Error("a failed login set a cookie")
	}
}

func TestLoginIsRateLimited(t *testing.T) {
	srv, email := newTestServer(t)

	var lastStatus int
	for i := 0; i < 15; i++ {
		res := login(t, srv, email, "wrong password")
		lastStatus = res.StatusCode
		res.Body.Close()
		if lastStatus == http.StatusTooManyRequests {
			break
		}
	}

	if lastStatus != http.StatusTooManyRequests {
		t.Errorf("after 15 failed logins status = %d, want 429", lastStatus)
	}
}
