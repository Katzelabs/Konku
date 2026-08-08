package api_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Katzelabs/Konku/internal/srs"
)

type sessionBody struct {
	ID              string  `json:"id"`
	DomainID        *string `json:"domainId"`
	DurationMinutes int32   `json:"durationMinutes"`
	SessionDate     string  `json:"sessionDate"`
}

// TestSessionDateComesFromTheClient is A3's acceptance criterion, in the form
// that can actually be asserted: the stored date is the one the client sent,
// not one derived from the server's clock. A session finished at 23:50 belongs
// to that day, and the server may be hours away in either direction.
func TestSessionDateComesFromTheClient(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	// A date deliberately different from the server's today. If the handler
	// derived the date from now(), this comes back as today instead.
	yesterday := srs.Today(time.Now()).AddDays(-1)

	math := c.domainID("math")

	var sess sessionBody
	c.expect(c.do(http.MethodPost, "/sessions", map[string]any{
		"durationMinutes": 20,
		"sessionDate":     string(yesterday),
		"domainId":        math,
	}), http.StatusCreated, &sess)

	if sess.SessionDate != string(yesterday) {
		t.Fatalf("sessionDate = %q, want %q — the server derived the date instead of trusting the client",
			sess.SessionDate, yesterday)
	}
	if sess.DurationMinutes != 20 {
		t.Errorf("durationMinutes = %d, want 20", sess.DurationMinutes)
	}
	if sess.DomainID == nil || *sess.DomainID != math {
		t.Errorf("domainId = %v, want %s", sess.DomainID, math)
	}

	// And it is stored as a date, with no time-of-day component to drift.
	var stored string
	if err := c.app.store.Pool().QueryRow(c.app.ctx,
		"SELECT session_date::text FROM focus_sessions WHERE id = $1", sess.ID).Scan(&stored); err != nil {
		t.Fatalf("reading the stored session: %v", err)
	}
	if stored != string(yesterday) {
		t.Errorf("stored session_date = %q, want %q", stored, yesterday)
	}
}

func TestSessionWithoutADomain(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	var sess sessionBody
	c.expect(c.do(http.MethodPost, "/sessions", map[string]any{
		"durationMinutes": 25,
		"sessionDate":     string(srs.Today(time.Now())),
	}), http.StatusCreated, &sess)

	if sess.DomainID != nil {
		t.Errorf("domainId = %v, want null — a session need not be tagged", *sess.DomainID)
	}
}

func TestSessionValidation(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	today := string(srs.Today(time.Now()))

	tests := []struct {
		name string
		body map[string]any
	}{
		{"no date", map[string]any{"durationMinutes": 20}},
		{"a date that is not a date", map[string]any{"durationMinutes": 20, "sessionDate": "kemarin"}},
		{"a timestamp instead of a date", map[string]any{"durationMinutes": 20, "sessionDate": "2026-08-05T23:50:00Z"}},
		{"a clock that is badly wrong", map[string]any{"durationMinutes": 20, "sessionDate": "2099-01-01"}},
		{"zero minutes", map[string]any{"durationMinutes": 0, "sessionDate": today}},
		{"negative minutes", map[string]any{"durationMinutes": -20, "sessionDate": today}},
		{"an implausible duration", map[string]any{"durationMinutes": 10000, "sessionDate": today}},
		{"an unknown domain", map[string]any{"durationMinutes": 20, "sessionDate": today, "domainId": "astrologi"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := c.do(http.MethodPost, "/sessions", tt.body)
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", res.StatusCode)
			}
		})
	}
}

// A session with a date one day either side of the server's is normal — the
// user may simply be in a different timezone.
func TestSessionAcceptsNeighbouringDays(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	for _, offset := range []int{-1, 0, 1} {
		date := srs.Today(time.Now()).AddDays(offset)
		res := c.do(http.MethodPost, "/sessions", map[string]any{
			"durationMinutes": 15,
			"sessionDate":     string(date),
		})
		if res.StatusCode != http.StatusCreated {
			t.Errorf("date %q: status = %d, want 201", date, res.StatusCode)
		}
	}
}
