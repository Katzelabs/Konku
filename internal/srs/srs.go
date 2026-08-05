// Package srs implements the spaced-repetition scheduler.
//
// PURE: this package imports nothing from internal/. No database, no HTTP,
// no framework. It carries the product's value and must stay trivially
// testable (D-032).
package srs

import (
	"sort"
	"time"
)

// Intervals is the ladder, in days (D-008). Clearing the last one retires
// the card to StateMastered rather than looping it forever, which is what
// turns a year of daily capture into an unbounded daily obligation.
var Intervals = []int{1, 3, 7, 14, 30, 90, 180}

// DefaultDueLimit caps how many cards surface in a day (D-009). Returning
// from two weeks away to 40 due cards is demotivating regardless of styling.
const DefaultDueLimit = 10

type Rating string

const (
	Ingat Rating = "ingat"
	Lupa  Rating = "lupa"
)

type State string

const (
	StateLearning State = "learning"
	StateMastered State = "mastered"
)

// Date is a local calendar date as YYYY-MM-DD, never a UTC timestamp.
// A session at 23:00 belongs to that day, not the next one.
//
// ISO-8601 dates sort lexicographically, so string comparison is correct
// date comparison. That is why this is a string and not a time.Time.
type Date string

const dateLayout = "2006-01-02"

// Today returns now as a local date. Callers pass the clock in so that
// this package stays deterministic and testable.
func Today(now time.Time) Date {
	return Date(now.Format(dateLayout))
}

// AddDays returns the date n days later. An unparseable date returns itself,
// which keeps the scheduler total; validation belongs at the boundary.
func (d Date) AddDays(n int) Date {
	t, err := time.Parse(dateLayout, string(d))
	if err != nil {
		return d
	}
	return Date(t.AddDate(0, 0, n).Format(dateLayout))
}

// OnOrBefore reports whether d falls on or before other.
func (d Date) OnOrBefore(other Date) bool { return d <= other }

// Schedule is the review state of a single card.
type Schedule struct {
	CardID     string
	Stage      int   // index into Intervals
	NextReview Date  // empty once mastered: no longer scheduled
	Lapses     int
	State      State
}

// NewSchedule is the state of a freshly captured card: due tomorrow.
func NewSchedule(cardID string, today Date) Schedule {
	return Schedule{
		CardID:     cardID,
		Stage:      0,
		NextReview: today.AddDays(Intervals[0]),
		State:      StateLearning,
	}
}

// Next applies a review outcome and returns the updated schedule.
//
//   - Ingat advances one rung; clearing the top rung retires the card.
//   - Lupa resets to the bottom rung, due tomorrow, and counts a lapse.
//     It also un-masters a card, so a manually reviewed mastered card that
//     turns out to be forgotten re-enters the rotation.
func Next(cur Schedule, rating Rating, today Date) Schedule {
	out := cur

	if rating == Lupa {
		out.Stage = 0
		out.Lapses++
		out.State = StateLearning
		out.NextReview = today.AddDays(Intervals[0])
		return out
	}

	out.Stage = cur.Stage + 1
	if out.Stage >= len(Intervals) {
		out.Stage = len(Intervals) - 1
		out.State = StateMastered
		out.NextReview = ""
		return out
	}

	out.State = StateLearning
	out.NextReview = today.AddDays(Intervals[out.Stage])
	return out
}

// Master retires a card at any stage — sometimes you simply know it (D-008).
func Master(cur Schedule) Schedule {
	out := cur
	out.State = StateMastered
	out.NextReview = ""
	return out
}

// Due returns the cards to review today, oldest-due first, capped at limit.
// A limit of zero or less means DefaultDueLimit.
func Due(schedules []Schedule, today Date, limit int) []Schedule {
	if limit <= 0 {
		limit = DefaultDueLimit
	}

	due := make([]Schedule, 0, len(schedules))
	for _, s := range schedules {
		if s.State != StateLearning || s.NextReview == "" {
			continue
		}
		if s.NextReview.OnOrBefore(today) {
			due = append(due, s)
		}
	}

	// Oldest first, then by card ID so the order is stable across calls.
	sort.SliceStable(due, func(i, j int) bool {
		if due[i].NextReview != due[j].NextReview {
			return due[i].NextReview < due[j].NextReview
		}
		return due[i].CardID < due[j].CardID
	})

	if len(due) > limit {
		due = due[:limit]
	}
	return due
}
