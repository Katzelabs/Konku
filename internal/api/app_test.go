package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/api"
	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/web"
)

// testApp is the whole server against the dev Postgres. Tests drive it over
// HTTP like the browser does, and reach for the store only to assert on state
// the API deliberately does not expose — a card's schedule, a review log.
type testApp struct {
	srv   *httptest.Server
	store *store.Store
	auth  *auth.Service
	ctx   context.Context
}

func newApp(t *testing.T) *testApp {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; run `make test-integration`")
	}

	ctx := context.Background()
	st, err := store.Open(ctx, url)
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	t.Cleanup(st.Close)
	if err := st.Migrate(ctx); err != nil {
		t.Fatalf("migrating: %v", err)
	}

	cfg := config.Config{Dev: true, SessionTTL: time.Hour}
	svc := auth.NewService(st, cfg.SessionTTL)

	srv := httptest.NewServer(api.NewServer(cfg, st, svc, web.FS()).Routes())
	t.Cleanup(srv.Close)

	return &testApp{srv: srv, store: st, auth: svc, ctx: ctx}
}

// testClient is one signed-in user.
type testClient struct {
	t      *testing.T
	app    *testApp
	cookie *http.Cookie
	userID uuid.UUID
	email  string
}

// newClient creates a user and signs them in. Deleting the user on cleanup
// cascades to their notes, cards, schedules and logs, so tests leave no
// residue in the shared dev database.
func (a *testApp) newClient(t *testing.T) *testClient {
	t.Helper()

	email := "api-" + uuid.NewString() + "@example.com"
	user, err := a.auth.CreateUser(a.ctx, email, testPassword)
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = a.store.Pool().Exec(context.Background(), "DELETE FROM users WHERE id = $1", user.ID)
	})

	res := login(t, a.srv, email, testPassword)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, want 200", res.StatusCode)
	}

	return &testClient{t: t, app: a, cookie: sessionCookie(t, res), userID: user.ID, email: email}
}

// do sends an authenticated request. A nil body means no body at all.
func (c *testClient) do(method, path string, body any) *http.Response {
	c.t.Helper()

	var rdr io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			c.t.Fatalf("encoding request: %v", err)
		}
		rdr = bytes.NewReader(buf)
	}

	req, err := http.NewRequest(method, c.app.srv.URL+"/api"+path, rdr)
	if err != nil {
		c.t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(c.cookie)

	res, err := c.app.srv.Client().Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	c.t.Cleanup(func() { res.Body.Close() })
	return res
}

// expect asserts the status and decodes the body into dst, returning the raw
// body so a test can assert on what the wire actually carried.
func (c *testClient) expect(res *http.Response, want int, dst any) string {
	c.t.Helper()

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		c.t.Fatalf("reading body: %v", err)
	}
	if res.StatusCode != want {
		c.t.Fatalf("status = %d, want %d: %s", res.StatusCode, want, raw)
	}
	if dst != nil {
		if err := json.Unmarshal(raw, dst); err != nil {
			c.t.Fatalf("decoding %s: %v", raw, err)
		}
	}
	return string(raw)
}

type domainBody struct {
	ID    string `json:"id"`
	Slug  string `json:"slug"`
	Label string `json:"label"`
}

// domainID resolves one of this user's starter domains by slug.
//
// Domains stopped being global text ids like "math" when they became per-user
// (D-046), so a test cannot hardcode one: every account gets its own rows with
// their own uuids, seeded by auth.CreateUser.
func (c *testClient) domainID(slug string) string {
	c.t.Helper()

	var domains []domainBody
	c.expect(c.do(http.MethodGet, "/domains", nil), http.StatusOK, &domains)
	for _, d := range domains {
		if d.Slug == slug {
			return d.ID
		}
	}
	c.t.Fatalf("no seeded domain with slug %q", slug)
	return ""
}

type noteBody struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	ContentMd string  `json:"contentMd"`
	DomainID  *string `json:"domainId"`
	UpdatedAt string  `json:"updatedAt"`
}

// createNote is the common setup: a note, its cards synced, ready to assert on.
func (c *testClient) createNote(body any) noteBody {
	c.t.Helper()
	var note noteBody
	c.expect(c.do(http.MethodPost, "/notes", body), http.StatusCreated, &note)
	return note
}
