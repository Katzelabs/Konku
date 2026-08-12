package api_test

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Katzelabs/Konku/internal/config"
)

// Quotas (07 L8).
//
// L8's acceptance is "exceeding a quota returns a 429 with Indonesian copy
// naming the limit, and the metric from P2 shows quota rejections". Both
// halves are below. The limits are set small here through config rather than
// by writing five thousand notes — which is also the reason they are
// configurable at all, alongside being an operational knob.

func smallQuotaApp(t *testing.T, cfg config.Config) *testApp {
	t.Helper()
	cfg.Dev = true
	cfg.SessionTTL = time.Hour
	cfg.AllowSignup = true
	return newAppWith(t, cfg)
}

func TestNoteQuotaIsEnforced(t *testing.T) {
	a := smallQuotaApp(t, config.Config{MaxNotes: 2})
	c := a.newClient(t)

	c.createNote(map[string]any{"title": "Satu", "contentMd": "a"})
	c.createNote(map[string]any{"title": "Dua", "contentMd": "b"})

	res := c.do(http.MethodPost, "/notes", map[string]any{"title": "Tiga", "contentMd": "c"})
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}

	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429: %s", res.StatusCode, body)
	}
	// The copy names the limit. "Terlalu banyak" with no number is a dead end:
	// the person cannot tell a bug from a rule, and cannot act on either.
	if !strings.Contains(string(body), "2 catatan") {
		t.Errorf("the message does not name the limit: %s", body)
	}

	// And the metric records it (P2).
	if m := scrapeMetrics(t, a); !strings.Contains(m, `konku_quota_rejections_total{quota="notes"} 1`) {
		t.Errorf("no quota rejection in the metrics:\n%s", grepLines(m, "konku_quota"))
	}
}

func TestCardQuotaIsEnforced(t *testing.T) {
	a := smallQuotaApp(t, config.Config{MaxCards: 1})
	c := a.newClient(t)

	c.createCard(map[string]any{"front": "F", "back": "B"})

	res := c.do(http.MethodPost, "/cards", map[string]any{"front": "F2", "back": "B2"})
	body, _ := io.ReadAll(res.Body)

	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429: %s", res.StatusCode, body)
	}
	if !strings.Contains(string(body), "1 kartu") {
		t.Errorf("the message does not name the limit: %s", body)
	}
	if m := scrapeMetrics(t, a); !strings.Contains(m, `konku_quota_rejections_total{quota="cards"} 1`) {
		t.Errorf("no cards rejection in the metrics:\n%s", grepLines(m, "konku_quota"))
	}
}

// Deleting frees the quota back up. The cap is on what the person has, not on
// what they have ever had — otherwise emptying Terhapus becomes a prerequisite
// for writing, which is exactly the friction hard rule 7 rules out.
func TestDeletingANoteFreesQuota(t *testing.T) {
	a := smallQuotaApp(t, config.Config{MaxNotes: 1})
	c := a.newClient(t)

	first := c.createNote(map[string]any{"title": "Satu", "contentMd": "a"})

	res := c.do(http.MethodPost, "/notes", map[string]any{"title": "Dua", "contentMd": "b"})
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("second note = %d, want 429", res.StatusCode)
	}

	c.expect(c.do(http.MethodDelete, "/notes/"+first.ID, nil), http.StatusNoContent, nil)

	c.createNote(map[string]any{"title": "Dua", "contentMd": "b"})
}

// The write limiter is per account, and reads are untouched: they neither grow
// the database nor hold a write transaction.
func TestWriteRateIsLimitedPerAccount(t *testing.T) {
	a := smallQuotaApp(t, config.Config{MaxWritesPerMinute: 3})
	c := a.newClient(t)
	other := a.newClient(t)

	// Three writes are allowed, the fourth is not.
	for i := 0; i < 3; i++ {
		c.createNote(map[string]any{"title": "Catatan", "contentMd": "isi"})
	}

	res := c.do(http.MethodPost, "/notes", map[string]any{"title": "Keempat", "contentMd": "isi"})
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("fourth write = %d, want 429: %s", res.StatusCode, body)
	}
	if !strings.Contains(string(body), "3 per menit") {
		t.Errorf("the message does not name the limit: %s", body)
	}

	// Reading still works for the limited account.
	if res := c.do(http.MethodGet, "/notes", nil); res.StatusCode != http.StatusOK {
		t.Errorf("GET /notes = %d while write-limited, want 200", res.StatusCode)
	}

	// And another account is unaffected — the limiter is keyed by user, not by
	// IP, which is the whole point behind a shared NAT.
	if res := other.do(http.MethodPost, "/notes",
		map[string]any{"title": "Punya orang lain", "contentMd": "isi"}); res.StatusCode != http.StatusCreated {
		t.Errorf("another account's write = %d, want 201 — the limiter is keyed "+
			"by something shared", res.StatusCode)
	}

	if m := scrapeMetrics(t, a); !strings.Contains(m, `konku_quota_rejections_total{quota="write_rate"}`) {
		t.Errorf("no write_rate rejection in the metrics:\n%s", grepLines(m, "konku_quota"))
	}
}

// The quota metric must not be labelled per account: that would mint a time
// series per user, and counting other people's behaviour individually is the
// aggregation D-066 rules out.
func TestQuotaMetricCarriesNoUserLabel(t *testing.T) {
	a := smallQuotaApp(t, config.Config{MaxNotes: 1})
	c := a.newClient(t)
	c.createNote(map[string]any{"title": "Satu", "contentMd": "a"})
	c.do(http.MethodPost, "/notes", map[string]any{"title": "Dua", "contentMd": "b"})

	for _, line := range strings.Split(scrapeMetrics(t, a), "\n") {
		if !strings.HasPrefix(line, "konku_quota_rejections_total") {
			continue
		}
		if strings.Contains(line, "user") || strings.Contains(line, c.userID.String()) {
			t.Errorf("the quota metric is labelled per account: %s", line)
		}
	}
}
