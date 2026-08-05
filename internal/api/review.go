package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/srs"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// A card is addressed by note and ID together. Card IDs are only unique within
// their note — the primary key is (note_id, id) and card.NewID checks for
// collisions against the note, not the account — so {cardID} alone cannot name
// a card.

// dueCard is the prompt side of a card, and nothing else.
//
// There is no Back field here and there must never be one. Recall before
// reveal is the mechanism the whole product rests on (D-003); shipping the
// answer alongside the prompt would let a glance at dev-tools defeat it, and
// the user would not even have to intend to cheat.
type dueCard struct {
	ID     string `json:"id"`
	NoteID string `json:"noteId"`
	Type   string `json:"type"`
	Front  string `json:"front"`
}

type dueResponse struct {
	Cards []dueCard `json:"cards"`
	// Total is how many cards are due in all, before the daily cap. The UI
	// uses it to say "sisanya besok" plainly rather than pretending the day
	// is finished (D-009).
	Total int64 `json:"total"`
}

type answerResponse struct {
	Back string `json:"back"`
}

type ratingRequest struct {
	Rating string `json:"rating"`
}

type ratingResponse struct {
	Stage int32 `json:"stage"`
	State string `json:"state"`
	// Null once mastered: the card is no longer scheduled.
	NextReviewDate *string `json:"nextReviewDate"`
}

func (s *Server) handleDueCards(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	today, err := store.ToTime(srs.Today(time.Now()))
	if err != nil {
		writeInternal(w, err)
		return
	}

	limit := intParam(r, "limit", srs.DefaultDueLimit, 1, 100)

	rows, err := s.store.Q().ListDueCards(r.Context(), gen.ListDueCardsParams{
		UserID: user.ID,
		Today:  today,
		Limit:  int32(limit),
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	total, err := s.store.Q().CountDueCards(r.Context(), gen.CountDueCardsParams{
		UserID: user.ID,
		Today:  today,
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	cards := make([]dueCard, 0, len(rows))
	for _, row := range rows {
		cards = append(cards, dueCard{
			ID:     row.ID,
			NoteID: row.NoteID.String(),
			Type:   row.Type,
			Front:  row.Front,
		})
	}

	writeJSON(w, http.StatusOK, dueResponse{Cards: cards, Total: total})
}

// handleCardAnswer is a separate request on purpose, made only when the user
// has chosen to reveal.
func (s *Server) handleCardAnswer(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	noteID, cardID, ok := cardParams(w, r)
	if !ok {
		return
	}

	row, err := s.store.Q().GetCardWithSchedule(r.Context(), gen.GetCardWithScheduleParams{
		NoteID: noteID, ID: cardID, UserID: user.ID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusOK, answerResponse{Back: row.Card.Back})
}

// handleRate applies a review outcome.
//
// The schedule update and the log row commit together. A review that moved the
// schedule without logging is invisible afterwards, and retention cannot be
// reconstructed retroactively — which is why review_logs exists before the
// feature that reads it (D-029).
func (s *Server) handleRate(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	noteID, cardID, ok := cardParams(w, r)
	if !ok {
		return
	}

	var req ratingRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	rating := srs.Rating(req.Rating)
	if rating != srs.Ingat && rating != srs.Lupa {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Penilaian harus 'ingat' atau 'lupa'.")
		return
	}

	// The user's local day, not the server's UTC day: a card reviewed at 23:00
	// belongs to that day.
	today := srs.Today(time.Now())

	var next srs.Schedule
	err := s.store.WithTx(r.Context(), func(q *gen.Queries) error {
		row, err := q.GetCardWithSchedule(r.Context(), gen.GetCardWithScheduleParams{
			NoteID: noteID, ID: cardID, UserID: user.ID,
		})
		if err != nil {
			return err
		}

		current := srs.Schedule{
			CardID:     row.Card.ID,
			Stage:      int(row.CardSchedule.Stage),
			NextReview: store.FromTimePtr(row.CardSchedule.NextReviewDate),
			Lapses:     int(row.CardSchedule.Lapses),
			State:      srs.State(row.CardSchedule.State),
		}
		next = srs.Next(current, rating, today)

		due, err := store.ToTimePtr(next.NextReview)
		if err != nil {
			return err
		}
		if _, err := q.UpdateSchedule(r.Context(), gen.UpdateScheduleParams{
			NoteID:         noteID,
			CardID:         cardID,
			UserID:         user.ID,
			Stage:          int32(next.Stage),
			NextReviewDate: due,
			Lapses:         int32(next.Lapses),
			State:          string(next.State),
		}); err != nil {
			return err
		}

		_, err = q.InsertReviewLog(r.Context(), gen.InsertReviewLogParams{
			NoteID:         noteID,
			CardID:         cardID,
			UserID:         user.ID,
			Rating:         string(rating),
			IntervalBefore: intervalDays(current),
			IntervalAfter:  intervalDays(next),
		})
		return err
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	resp := ratingResponse{Stage: int32(next.Stage), State: string(next.State)}
	if next.NextReview != "" {
		d := string(next.NextReview)
		resp.NextReviewDate = &d
	}
	writeJSON(w, http.StatusOK, resp)
}

// intervalDays is the ladder rung a schedule sits on, in days. A card that is
// no longer scheduled logs zero.
func intervalDays(s srs.Schedule) int32 {
	if s.State != srs.StateLearning || s.NextReview == "" {
		return 0
	}
	if s.Stage < 0 || s.Stage >= len(srs.Intervals) {
		return 0
	}
	return int32(srs.Intervals[s.Stage])
}

func cardParams(w http.ResponseWriter, r *http.Request) (uuid.UUID, string, bool) {
	noteID, err := uuid.Parse(chi.URLParam(r, "noteID"))
	if err != nil {
		writeNotFound(w)
		return uuid.UUID{}, "", false
	}
	cardID := chi.URLParam(r, "cardID")
	if cardID == "" {
		writeNotFound(w)
		return uuid.UUID{}, "", false
	}
	return noteID, cardID, true
}
