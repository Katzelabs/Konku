package store

import (
	"fmt"
	"time"

	"github.com/Katzelabs/Konku/internal/srs"
)

// Dates cross the database boundary as time.Time because pgx cannot decode a
// Postgres `date` into a string in binary format. Everywhere above the store
// they are srs.Date — local YYYY-MM-DD strings.
//
// These four functions are the ONLY place that conversion happens, and they
// use UTC exclusively. A Postgres `date` has no timezone, so treating it as
// UTC midnight is lossless in both directions. Calling In(), Local() or UTC()
// on these values anywhere else is how an 11pm session silently becomes
// tomorrow's — the exact bug the date convention exists to prevent.

const dateLayout = "2006-01-02"

// ToTime converts a local calendar date for storage.
func ToTime(d srs.Date) (time.Time, error) {
	t, err := time.ParseInLocation(dateLayout, string(d), time.UTC)
	if err != nil {
		return time.Time{}, fmt.Errorf("store: invalid date %q: %w", d, err)
	}
	return t, nil
}

// ToTimePtr converts a date for a nullable column. The empty date, which srs
// uses for mastered cards, becomes NULL.
func ToTimePtr(d srs.Date) (*time.Time, error) {
	if d == "" {
		return nil, nil
	}
	t, err := ToTime(d)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// FromTime converts a stored date back to a local calendar date.
func FromTime(t time.Time) srs.Date {
	return srs.Date(t.Format(dateLayout))
}

// FromTimePtr converts a nullable stored date. NULL becomes the empty date,
// which srs treats as "not scheduled".
func FromTimePtr(t *time.Time) srs.Date {
	if t == nil {
		return ""
	}
	return FromTime(*t)
}
