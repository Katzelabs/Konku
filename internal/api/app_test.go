package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/api"
	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
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
	// metrics is the Prometheus handler, which production serves on its own
	// loopback listener rather than on srv (D-062). Tests reach it directly
	// for the same reason: it is deliberately not routable from the app.
	metrics http.Handler
	// mail records what the server tried to send. The signup flow's whole
	// point is that a token reaches a mailbox, so a test that cannot read the
	// mailbox can only assert status codes (07 L3).
	mail *fakeMailer
}

// sentMail is one message the server handed to the transport.
type sentMail struct {
	kind  string // "verification" or "reset"
	to    string
	token string
}

// fakeMailer stands in for internal/mail. The real transport has its own tests
// against a live catcher; what matters here is which token went to which
// address, which a catcher would make harder to read, not easier.
type fakeMailer struct {
	mu   sync.Mutex
	sent []sentMail
	// err, when set, is returned by every send. Signup must still succeed and
	// still answer 204 when the provider is down — the account is already
	// committed by then.
	err error
}

func (m *fakeMailer) record(kind, to, token string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, sentMail{kind: kind, to: to, token: token})
	return m.err
}

func (m *fakeMailer) SendVerification(_ context.Context, to, token string) error {
	return m.record("verification", to, token)
}

func (m *fakeMailer) SendPasswordReset(_ context.Context, to, token string) error {
	return m.record("reset", to, token)
}

// lastTo returns the most recent message sent to an address.
func (m *fakeMailer) lastTo(t *testing.T, to string) sentMail {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := len(m.sent) - 1; i >= 0; i-- {
		if m.sent[i].to == to {
			return m.sent[i]
		}
	}
	t.Fatalf("no mail was sent to that address; the server sent %d message(s)", len(m.sent))
	return sentMail{}
}

// countTo reports how many messages went to an address.
func (m *fakeMailer) countTo(to string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, s := range m.sent {
		if s.to == to {
			n++
		}
	}
	return n
}

// migrationURL is the owner connection used for DDL. The application pool
// connects as konku_app, which deliberately has no DDL rights (D-059).
func migrationURL() string { return os.Getenv("TEST_MIGRATION_DATABASE_URL") }

// requireRLSEnforcedRole fails if the test connection can bypass row-level
// security. FORCE ROW LEVEL SECURITY does not apply to a SUPERUSER or a
// BYPASSRLS role, and the dev database's `konku` is both. Connected as that
// role, every tenancy test below passes while proving nothing.
func requireRLSEnforcedRole(t *testing.T, st *store.Store) {
	t.Helper()

	var name string
	var super, bypass bool
	if err := st.Pool().QueryRow(context.Background(),
		`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
	).Scan(&name, &super, &bypass); err != nil {
		t.Fatalf("reading the current role: %v", err)
	}
	if super || bypass {
		t.Fatalf("tests are connected as %q (superuser=%v, bypassrls=%v). "+
			"RLS is inert for this role, so the tenancy suite would certify a "+
			"protection that does not exist. Run `make db-app-role` and point "+
			"TEST_DATABASE_URL at konku_app.", name, super, bypass)
	}
}

func newApp(t *testing.T) *testApp {
	t.Helper()
	return newAppWith(t, config.Config{Dev: true, SessionTTL: time.Hour, AllowSignup: true})
}

// newAppWith builds the same server with a different configuration, which is
// how the quota tests get limits small enough to reach without writing five
// thousand notes (07 L8).
func newAppWith(t *testing.T, cfg config.Config) *testApp {
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
	if err := st.Migrate(ctx, migrationURL()); err != nil {
		t.Fatalf("migrating: %v", err)
	}
	requireRLSEnforcedRole(t, st)

	svc := auth.NewService(st, cfg.SessionTTL)
	mailer := &fakeMailer{}

	app := api.NewServer(cfg, st, svc, mailer, web.FS())
	srv := httptest.NewServer(app.Routes())
	t.Cleanup(srv.Close)

	return &testApp{srv: srv, store: st, auth: svc, ctx: ctx, metrics: app.MetricsHandler(), mail: mailer}
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

// asUser runs a *gen.Queries operation inside a transaction scoped to this
// client's user.
//
// RLS means a query on the application pool with no app.user_id set matches no
// rows at all (D-059). Tests that reach past the API to assert on stored state
// — a card's schedule, a review log — have to declare who they are, exactly
// like the application does. That is not test scaffolding working around the
// feature; it is the test being held to the same rule as the code.
func (c *testClient) asUser(fn func(*gen.Queries) error) error {
	c.t.Helper()
	return c.app.store.WithUserTx(c.app.ctx, c.userID, fn)
}

// scanAs runs raw SQL inside the client's user transaction and scans one row.
// Used where the assertion is about the column type or the stored text, which
// the generated types would hide.
func (c *testClient) scanAs(sql string, args []any, dst ...any) error {
	c.t.Helper()

	tx, err := c.app.store.Pool().Begin(c.app.ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(c.app.ctx) }()

	if _, err := tx.Exec(c.app.ctx,
		"select set_config('app.user_id', $1, true)", c.userID.String()); err != nil {
		return err
	}
	return tx.QueryRow(c.app.ctx, sql, args...).Scan(dst...)
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
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	ContentMd   string   `json:"contentMd"`
	DomainID    *string  `json:"domainId"`
	CategoryIDs []string `json:"categoryIds"`
	UpdatedAt   string   `json:"updatedAt"`
}

func (c *testClient) createNote(body any) noteBody {
	c.t.Helper()
	var note noteBody
	c.expect(c.do(http.MethodPost, "/notes", body), http.StatusCreated, &note)
	return note
}

type cardBody struct {
	ID          string   `json:"id"`
	Front       string   `json:"front"`
	Back        string   `json:"back"`
	Type        string   `json:"type"`
	DomainID    *string  `json:"domainId"`
	CategoryIDs []string `json:"categoryIds"`
}

// createCard is the common setup now that a card is its own resource (D-055).
// It used to be a side effect of saving a note whose markdown held `Q :: A`.
func (c *testClient) createCard(body any) cardBody {
	c.t.Helper()
	var card cardBody
	c.expect(c.do(http.MethodPost, "/cards", body), http.StatusCreated, &card)
	return card
}

type categoryBody struct {
	ID         string  `json:"id"`
	Slug       string  `json:"slug"`
	Label      string  `json:"label"`
	ArchivedAt *string `json:"archivedAt"`
	NoteCount  int64   `json:"noteCount"`
	CardCount  int64   `json:"cardCount"`
}

// createCategory posts a label. The endpoint is create-on-type and therefore
// idempotent, so it answers 201 for a new slug and 200 for one that exists.
func (c *testClient) createCategory(label string) categoryBody {
	c.t.Helper()
	res := c.do(http.MethodPost, "/categories", map[string]any{"label": label})
	if res.StatusCode != http.StatusCreated && res.StatusCode != http.StatusOK {
		c.t.Fatalf("creating category %q: status %d", label, res.StatusCode)
	}
	var out categoryBody
	c.expect(res, res.StatusCode, &out)
	return out
}
