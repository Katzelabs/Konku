package srs

import (
	"testing"
)

const today = Date("2026-08-05")

func TestNext(t *testing.T) {
	tests := []struct {
		name       string
		cur        Schedule
		rating     Rating
		wantStage  int
		wantNext   Date
		wantLapses int
		wantState  State
	}{
		{
			name:      "ingat at stage 0 advances to the 3-day rung",
			cur:       Schedule{Stage: 0, NextReview: today, State: StateLearning},
			rating:    Ingat,
			wantStage: 1,
			wantNext:  "2026-08-08",
			wantState: StateLearning,
		},
		{
			name:      "ingat at the 30-day rung advances to 90",
			cur:       Schedule{Stage: 4, NextReview: today, State: StateLearning},
			rating:    Ingat,
			wantStage: 5,
			wantNext:  "2026-11-03",
			wantState: StateLearning,
		},
		{
			name:      "ingat clearing the top rung retires the card",
			cur:       Schedule{Stage: 6, NextReview: today, State: StateLearning},
			rating:    Ingat,
			wantStage: 6,
			wantNext:  "",
			wantState: StateMastered,
		},
		{
			name:       "lupa resets to tomorrow and counts a lapse",
			cur:        Schedule{Stage: 5, NextReview: today, Lapses: 2, State: StateLearning},
			rating:     Lupa,
			wantStage:  0,
			wantNext:   "2026-08-06",
			wantLapses: 3,
			wantState:  StateLearning,
		},
		{
			name:       "lupa un-masters a card that turns out to be forgotten",
			cur:        Schedule{Stage: 6, NextReview: "", State: StateMastered},
			rating:     Lupa,
			wantStage:  0,
			wantNext:   "2026-08-06",
			wantLapses: 1,
			wantState:  StateLearning,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Next(tt.cur, tt.rating, today)
			if got.Stage != tt.wantStage {
				t.Errorf("Stage = %d, want %d", got.Stage, tt.wantStage)
			}
			if got.NextReview != tt.wantNext {
				t.Errorf("NextReview = %q, want %q", got.NextReview, tt.wantNext)
			}
			if got.Lapses != tt.wantLapses {
				t.Errorf("Lapses = %d, want %d", got.Lapses, tt.wantLapses)
			}
			if got.State != tt.wantState {
				t.Errorf("State = %q, want %q", got.State, tt.wantState)
			}
		})
	}
}

func TestNewScheduleIsDueTomorrow(t *testing.T) {
	got := NewSchedule("c1", today)
	if got.NextReview != "2026-08-06" {
		t.Errorf("NextReview = %q, want 2026-08-06", got.NextReview)
	}
	if got.State != StateLearning {
		t.Errorf("State = %q, want learning", got.State)
	}
}

func TestDue(t *testing.T) {
	all := []Schedule{
		{CardID: "future", NextReview: "2026-08-09", State: StateLearning},
		{CardID: "overdue", NextReview: "2026-07-30", State: StateLearning},
		{CardID: "today", NextReview: today, State: StateLearning},
		{CardID: "mastered", NextReview: "", State: StateMastered},
	}

	got := Due(all, today, 0)

	if len(got) != 2 {
		t.Fatalf("got %d due cards, want 2", len(got))
	}
	if got[0].CardID != "overdue" {
		t.Errorf("first = %q, want overdue (oldest first)", got[0].CardID)
	}
	if got[1].CardID != "today" {
		t.Errorf("second = %q, want today", got[1].CardID)
	}
}

func TestDueRespectsLimit(t *testing.T) {
	var all []Schedule
	for _, d := range []Date{"2026-07-01", "2026-07-02", "2026-07-03"} {
		all = append(all, Schedule{CardID: string(d), NextReview: d, State: StateLearning})
	}

	got := Due(all, today, 2)

	if len(got) != 2 {
		t.Fatalf("got %d, want 2 (capped)", len(got))
	}
	if got[0].CardID != "2026-07-01" {
		t.Errorf("cap dropped the wrong end: first = %q", got[0].CardID)
	}
}

func TestDueIsStableForSameDate(t *testing.T) {
	all := []Schedule{
		{CardID: "b", NextReview: today, State: StateLearning},
		{CardID: "a", NextReview: today, State: StateLearning},
	}

	got := Due(all, today, 0)

	if got[0].CardID != "a" || got[1].CardID != "b" {
		t.Errorf("order = %q,%q; want a,b (stable by card ID)", got[0].CardID, got[1].CardID)
	}
}

func TestDateAddDaysCrossesMonths(t *testing.T) {
	if got := Date("2026-08-30").AddDays(3); got != "2026-09-02" {
		t.Errorf("AddDays across month = %q, want 2026-09-02", got)
	}
	if got := Date("2026-12-30").AddDays(3); got != "2027-01-02" {
		t.Errorf("AddDays across year = %q, want 2027-01-02", got)
	}
	if got := Date("2028-02-28").AddDays(1); got != "2028-02-29" {
		t.Errorf("AddDays into leap day = %q, want 2028-02-29", got)
	}
}
