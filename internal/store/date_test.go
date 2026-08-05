package store

import (
	"testing"
	"time"

	"github.com/Katzelabs/Konku/internal/srs"
)

// The date conversion is the one place a timezone bug can enter the system.
// These tests run without a database on purpose — they must never be skipped.

func TestDateRoundTrip(t *testing.T) {
	for _, d := range []srs.Date{
		"2026-08-05",
		"2026-01-01",
		"2026-12-31",
		"2028-02-29", // leap day
	} {
		tm, err := ToTime(d)
		if err != nil {
			t.Fatalf("ToTime(%q): %v", d, err)
		}
		if got := FromTime(tm); got != d {
			t.Errorf("round trip of %q gave %q", d, got)
		}
	}
}

// The empty date means "not scheduled" — a mastered card. It must become SQL
// NULL, not the zero date, or every mastered card reappears at the front of
// the due list.
func TestEmptyDateBecomesNull(t *testing.T) {
	got, err := ToTimePtr("")
	if err != nil {
		t.Fatalf("ToTimePtr(\"\"): %v", err)
	}
	if got != nil {
		t.Errorf("got %v, want nil so the column is NULL", got)
	}
	if back := FromTimePtr(nil); back != "" {
		t.Errorf("NULL became %q, want the empty date", back)
	}
}

// The reason UTC is used everywhere in this file: a date derived from a local
// clock must survive storage unchanged, even when the UTC instant falls on a
// different calendar day. This is the "an 11pm session belongs to that day"
// rule, tested in both directions.
func TestNoTimezoneShift(t *testing.T) {
	tests := []struct {
		name     string
		zone     string
		local    time.Time
		wantUTC  string // the day UTC would wrongly report
		wantDate srs.Date
	}{
		{
			// Jakarta is UTC+7, so an early-morning session is still the
			// previous day in UTC. This is the user's own timezone.
			name:     "east of UTC, early morning",
			zone:     "Asia/Jakarta",
			local:    time.Date(2026, 8, 5, 1, 0, 0, 0, time.UTC),
			wantUTC:  "2026-08-04",
			wantDate: "2026-08-05",
		},
		{
			// West of UTC, a late-night session is already tomorrow in UTC.
			name:     "west of UTC, late night",
			zone:     "America/New_York",
			local:    time.Date(2026, 8, 5, 23, 0, 0, 0, time.UTC),
			wantUTC:  "2026-08-06",
			wantDate: "2026-08-05",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			loc, err := time.LoadLocation(tt.zone)
			if err != nil {
				t.Skipf("tzdata unavailable: %v", err)
			}

			y, m, d := tt.local.Date()
			h := tt.local.Hour()
			localClock := time.Date(y, m, d, h, 0, 0, 0, loc)

			// Confirm the premise: UTC really does disagree about the day.
			if got := localClock.UTC().Format(dateLayout); got != tt.wantUTC {
				t.Fatalf("premise wrong: UTC says %s, expected %s", got, tt.wantUTC)
			}

			// srs.Today reads the local clock, which is the whole point.
			local := srs.Today(localClock)
			if local != tt.wantDate {
				t.Fatalf("srs.Today = %q, want %q", local, tt.wantDate)
			}

			stored, err := ToTime(local)
			if err != nil {
				t.Fatalf("ToTime: %v", err)
			}
			if got := FromTime(stored); got != tt.wantDate {
				t.Errorf("date shifted through storage: %q, want %q", got, tt.wantDate)
			}
		})
	}
}

func TestInvalidDateRejected(t *testing.T) {
	for _, bad := range []srs.Date{"05-08-2026", "2026-8-5", "not a date", "2026-13-01"} {
		if _, err := ToTime(bad); err == nil {
			t.Errorf("ToTime(%q) accepted an invalid date", bad)
		}
	}
}
