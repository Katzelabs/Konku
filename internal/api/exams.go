package api

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/srs"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// An exam is a practice test over cards that already live in notes (D-048).
//
// Two things about it are load-bearing and easy to undo by accident:
//
//   - The question list never carries the answer. Recall before reveal is what
//     separates a retention system from a list of things you once wrote down
//     (D-003), and it applies here exactly as it does to review.
//   - Answering does not move the schedule. An exam answer is written to
//     review_logs with source 'exam' and card_schedules is left alone (D-049).
//     A bad practice run must not cost a month of real progress (rule 6).

const (
	maxExamTitleLen = 200
	maxExamDescLen  = 2000
	maxQuestions    = 100
	maxTimeLimit    = 480
	attemptsPerPage = 20
)

type examRequest struct {
	Title            *string `json:"title"`
	Description      *string `json:"description"`
	DomainID         *string `json:"domainId"`
	Selection        *string `json:"selection"`
	QuestionCount    *int32  `json:"questionCount"`
	TimeLimitMinutes *int32  `json:"timeLimitMinutes"`
}

type examResponse struct {
	ID               string    `json:"id"`
	Title            string    `json:"title"`
	Description      string    `json:"description"`
	DomainID         *string   `json:"domainId"`
	Selection        string    `json:"selection"`
	QuestionCount    *int32    `json:"questionCount"`
	TimeLimitMinutes *int32    `json:"timeLimitMinutes"`
	AttemptCount     int64     `json:"attemptCount"`
	CreatedAt        time.Time `json:"createdAt"`
}

func toExamResponse(e gen.Exam, attempts int64) examResponse {
	return examResponse{
		ID:               e.ID.String(),
		Title:            e.Title,
		Description:      e.Description,
		DomainID:         uuidString(e.DomainID),
		Selection:        e.Selection,
		QuestionCount:    e.QuestionCount,
		TimeLimitMinutes: e.TimeLimitMinutes,
		AttemptCount:     attempts,
		CreatedAt:        e.CreatedAt,
	}
}

func (s *Server) handleListExams(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	rows, err := s.store.Q().ListExams(r.Context(), user.ID)
	if err != nil {
		writeInternal(w, err)
		return
	}

	out := make([]examResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toExamResponse(gen.Exam{
			ID:               row.ID,
			UserID:           row.UserID,
			DomainID:         row.DomainID,
			Title:            row.Title,
			Description:      row.Description,
			Selection:        row.Selection,
			QuestionCount:    row.QuestionCount,
			TimeLimitMinutes: row.TimeLimitMinutes,
			CreatedAt:        row.CreatedAt,
		}, row.AttemptCount))
	}

	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetExam(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	exam, ok := s.examOr404(w, r)
	if !ok {
		return
	}

	attempts, err := s.store.Q().ListAttempts(r.Context(), gen.ListAttemptsParams{
		ExamID: exam.ID, UserID: user.ID, Limit: attemptsPerPage,
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	out := struct {
		examResponse
		Attempts []attemptResponse `json:"attempts"`
		// The pinned set, for a 'fixed' exam. Empty for 'random', whose
		// questions only exist once an attempt draws them.
		Cards []pinnedCard `json:"cards"`
	}{
		examResponse: toExamResponse(exam, int64(len(attempts))),
		Attempts:     make([]attemptResponse, 0, len(attempts)),
		Cards:        []pinnedCard{},
	}
	for _, a := range attempts {
		out.Attempts = append(out.Attempts, toAttemptResponse(a))
	}

	if exam.Selection == "fixed" {
		pinned, err := s.store.Q().ListExamCards(r.Context(), gen.ListExamCardsParams{
			ExamID: exam.ID, UserID: user.ID,
		})
		if err != nil {
			writeInternal(w, err)
			return
		}
		for _, c := range pinned {
			out.Cards = append(out.Cards, pinnedCard{
				NoteID: c.NoteID.String(), CardID: c.CardID, Front: c.Front,
			})
		}
	}

	writeJSON(w, http.StatusOK, out)
}

type pinnedCard struct {
	NoteID string `json:"noteId"`
	CardID string `json:"cardId"`
	Front  string `json:"front"`
}

// handleListCards is the candidate list when pinning a fixed exam's questions.
// Prompts only — the picker shows what will be asked, never the answers.
func (s *Server) handleListCards(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	var domainID *uuid.UUID
	if raw := r.URL.Query().Get("domainId"); raw != "" {
		parsed, ok := s.parseDomain(w, r, &raw)
		if !ok {
			return
		}
		domainID = parsed
	}

	rows, err := s.store.Q().ListCardsForPicking(r.Context(), gen.ListCardsForPickingParams{
		UserID:   user.ID,
		DomainID: domainID,
		Limit:    int32(intParam(r, "limit", 200, 1, 500)),
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	out := make([]struct {
		pinnedCard
		NoteTitle string `json:"noteTitle"`
	}, 0, len(rows))
	for _, c := range rows {
		out = append(out, struct {
			pinnedCard
			NoteTitle string `json:"noteTitle"`
		}{
			pinnedCard: pinnedCard{NoteID: c.NoteID.String(), CardID: c.CardID, Front: c.Front},
			NoteTitle:  c.NoteTitle,
		})
	}

	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleCreateExam(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	var req examRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	title := strings.TrimSpace(deref(req.Title))
	selection := strings.TrimSpace(deref(req.Selection))
	if selection == "" {
		selection = "random"
	}
	if !validExam(w, title, deref(req.Description), selection, req.QuestionCount, req.TimeLimitMinutes) {
		return
	}
	domainID, ok := s.parseDomain(w, r, req.DomainID)
	if !ok {
		return
	}

	exam, err := s.store.Q().CreateExam(r.Context(), gen.CreateExamParams{
		UserID:           user.ID,
		DomainID:         domainID,
		Title:            title,
		Description:      deref(req.Description),
		Selection:        selection,
		QuestionCount:    questionCountFor(selection, req.QuestionCount),
		TimeLimitMinutes: req.TimeLimitMinutes,
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, toExamResponse(exam, 0))
}

func (s *Server) handleUpdateExam(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	current, ok := s.examOr404(w, r)
	if !ok {
		return
	}

	var req examRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	title, desc, selection := current.Title, current.Description, current.Selection
	count, limit := current.QuestionCount, current.TimeLimitMinutes
	domainID := current.DomainID

	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
	}
	if req.Description != nil {
		desc = *req.Description
	}
	if req.Selection != nil {
		selection = strings.TrimSpace(*req.Selection)
	}
	if req.QuestionCount != nil {
		count = req.QuestionCount
	}
	if req.TimeLimitMinutes != nil {
		limit = req.TimeLimitMinutes
	}
	if req.DomainID != nil {
		parsed, ok := s.parseDomain(w, r, req.DomainID)
		if !ok {
			return
		}
		domainID = parsed
	}

	if !validExam(w, title, desc, selection, count, limit) {
		return
	}

	exam, err := s.store.Q().UpdateExam(r.Context(), gen.UpdateExamParams{
		ID:               current.ID,
		UserID:           user.ID,
		DomainID:         domainID,
		Title:            title,
		Description:      desc,
		Selection:        selection,
		QuestionCount:    questionCountFor(selection, count),
		TimeLimitMinutes: limit,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusOK, toExamResponse(exam, 0))
}

func (s *Server) handleArchiveExam(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := examIDParam(w, r)
	if !ok {
		return
	}

	exam, err := s.store.Q().ArchiveExam(r.Context(), gen.ArchiveExamParams{ID: id, UserID: user.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusOK, toExamResponse(exam, 0))
}

// handleDeleteExam only succeeds for an exam that was never sat. One with
// attempts raises foreign_key_violation, because deleting it would destroy the
// score history while the answers survive in review_logs (D-051).
func (s *Server) handleDeleteExam(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := examIDParam(w, r)
	if !ok {
		return
	}

	rows, err := s.store.Q().DeleteExam(r.Context(), gen.DeleteExamParams{ID: id, UserID: user.ID})
	if isForeignKeyViolation(err) {
		writeError(w, http.StatusConflict, CodeConflict,
			"Ujian ini sudah pernah dikerjakan. Arsipkan saja.")
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}
	if rows == 0 {
		writeNotFound(w)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

type examCardRef struct {
	NoteID string `json:"noteId"`
	CardID string `json:"cardId"`
}

// handleSetExamCards replaces the pinned question set of a 'fixed' exam.
//
// Replace rather than append: the client sends the set it wants, which makes
// reordering and removal one request instead of a diff protocol.
func (s *Server) handleSetExamCards(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	exam, ok := s.examOr404(w, r)
	if !ok {
		return
	}
	if exam.Selection != "fixed" {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Hanya ujian dengan soal tetap yang punya daftar kartu.")
		return
	}

	var req struct {
		Cards []examCardRef `json:"cards"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Cards) > maxQuestions {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Terlalu banyak soal.")
		return
	}

	err := s.store.WithTx(r.Context(), func(q *gen.Queries) error {
		if err := q.ClearExamCards(r.Context(), gen.ClearExamCardsParams{
			ExamID: exam.ID, UserID: user.ID,
		}); err != nil {
			return err
		}
		for i, c := range req.Cards {
			noteID, err := uuid.Parse(c.NoteID)
			if err != nil {
				return errBadCardRef
			}
			if err := q.AddExamCard(r.Context(), gen.AddExamCardParams{
				ExamID:   exam.ID,
				UserID:   user.ID,
				NoteID:   noteID,
				CardID:   c.CardID,
				Position: int32(i + 1),
			}); err != nil {
				return err
			}
		}
		return nil
	})
	// A card that is not this user's fails the composite foreign key rather
	// than any check here — that is the point of D-047.
	if errors.Is(err, errBadCardRef) || isForeignKeyViolation(err) {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Ada kartu yang tidak dikenal.")
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

var errBadCardRef = errors.New("api: unparseable card reference")

func validExam(w http.ResponseWriter, title, desc, selection string, count, limit *int32) bool {
	if title == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Judul ujian tidak boleh kosong.")
		return false
	}
	if utf8.RuneCountInString(title) > maxExamTitleLen {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Judul ujian terlalu panjang.")
		return false
	}
	if utf8.RuneCountInString(desc) > maxExamDescLen {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Deskripsi ujian terlalu panjang.")
		return false
	}
	if selection != "fixed" && selection != "random" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Jenis soal harus 'fixed' atau 'random'.")
		return false
	}
	if selection == "random" {
		if count == nil || *count <= 0 || *count > maxQuestions {
			writeError(w, http.StatusBadRequest, CodeBadRequest, "Jumlah soal tidak masuk akal.")
			return false
		}
	}
	if limit != nil && (*limit <= 0 || *limit > maxTimeLimit) {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Batas waktu tidak masuk akal.")
		return false
	}
	return true
}

// questionCountFor keeps the column and the mode consistent. A CHECK
// constraint ties them together, so sending a count on a fixed exam would be a
// constraint violation rather than a 400 — drop it instead.
func questionCountFor(selection string, count *int32) *int32 {
	if selection == "fixed" {
		return nil
	}
	return count
}

func (s *Server) examOr404(w http.ResponseWriter, r *http.Request) (gen.Exam, bool) {
	user, _ := UserFrom(r.Context())

	id, ok := examIDParam(w, r)
	if !ok {
		return gen.Exam{}, false
	}

	exam, err := s.store.Q().GetExam(r.Context(), gen.GetExamParams{ID: id, UserID: user.ID})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && exam.ArchivedAt != nil) {
		writeNotFound(w)
		return gen.Exam{}, false
	}
	if err != nil {
		writeInternal(w, err)
		return gen.Exam{}, false
	}
	return exam, true
}

func examIDParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeNotFound(w)
		return uuid.UUID{}, false
	}
	return id, true
}

// Attempts.

type attemptResponse struct {
	ID           string     `json:"id"`
	ExamID       string     `json:"examId"`
	StartedAt    time.Time  `json:"startedAt"`
	FinishedAt   *time.Time `json:"finishedAt"`
	AttemptDate  string     `json:"attemptDate"`
	TotalCount   int32      `json:"totalCount"`
	CorrectCount int32      `json:"correctCount"`
}

func toAttemptResponse(a gen.ExamAttempt) attemptResponse {
	return attemptResponse{
		ID:           a.ID.String(),
		ExamID:       a.ExamID.String(),
		StartedAt:    a.StartedAt,
		FinishedAt:   a.FinishedAt,
		AttemptDate:  string(store.FromTime(a.AttemptDate)),
		TotalCount:   a.TotalCount,
		CorrectCount: a.CorrectCount,
	}
}

// questionResponse carries the prompt and never the answer. Revealing is a
// separate request the user has to make, after attempting recall (D-003).
type questionResponse struct {
	Position int32   `json:"position"`
	NoteID   string  `json:"noteId"`
	CardID   string  `json:"cardId"`
	Front    string  `json:"front"`
	Rating   *string `json:"rating"`
	// Missing reports a card whose note was deleted after the attempt began.
	// It still occupies its position in the score.
	Missing bool `json:"missing"`
}

type attemptDetail struct {
	attemptResponse
	Questions []questionResponse `json:"questions"`
}

type startAttemptRequest struct {
	// AttemptDate is the client's LOCAL calendar date as YYYY-MM-DD, for the
	// same reason focus sessions carry one.
	AttemptDate string `json:"attemptDate"`
}

func (s *Server) handleStartAttempt(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := examIDParam(w, r)
	if !ok {
		return
	}

	var req startAttemptRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	date, err := store.ToTime(srs.Date(req.AttemptDate))
	if err != nil {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Tanggal tidak valid.")
		return
	}
	if !withinClockSkew(date, time.Now()) {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Tanggal terlalu jauh dari hari ini. Cek jam di perangkat kamu.")
		return
	}

	started, err := s.store.StartAttempt(r.Context(), user.ID, id, date)
	if errors.Is(err, store.ErrExamNotFound) {
		writeNotFound(w)
		return
	}
	if errors.Is(err, store.ErrExamHasNoCards) {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Belum ada kartu untuk diujikan. Tulis beberapa kartu dulu.")
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	detail := s.attemptDetailFor(w, r, started.Attempt)
	if detail == nil {
		return
	}

	// A resumed attempt is 200, a fresh one 201, so the client can tell
	// "carried on" from "started" without comparing timestamps.
	status := http.StatusCreated
	if started.Resumed {
		status = http.StatusOK
	}
	writeJSON(w, status, detail)
}

func (s *Server) handleGetAttempt(w http.ResponseWriter, r *http.Request) {
	attempt, ok := s.attemptOr404(w, r)
	if !ok {
		return
	}
	detail := s.attemptDetailFor(w, r, attempt)
	if detail == nil {
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

// attemptDetailFor loads the question set. It returns nil after writing an
// error, so callers must check before writing their own response.
func (s *Server) attemptDetailFor(w http.ResponseWriter, r *http.Request, a gen.ExamAttempt) *attemptDetail {
	user, _ := UserFrom(r.Context())

	rows, err := s.store.Q().ListAttemptQuestions(r.Context(), gen.ListAttemptQuestionsParams{
		AttemptID: a.ID, UserID: user.ID,
	})
	if err != nil {
		writeInternal(w, err)
		return nil
	}

	out := &attemptDetail{
		attemptResponse: toAttemptResponse(a),
		Questions:       make([]questionResponse, 0, len(rows)),
	}
	for _, row := range rows {
		q := questionResponse{
			Position: row.Position,
			NoteID:   row.NoteID.String(),
			CardID:   row.CardID,
			Rating:   row.Rating,
		}
		if row.Front != nil && row.DeletedAt == nil {
			q.Front = *row.Front
		} else {
			q.Missing = true
		}
		out.Questions = append(out.Questions, q)
	}
	return out
}

// handleAttemptAnswer reveals the back of one question, after the user has
// attempted recall (D-003).
func (s *Server) handleAttemptAnswer(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	attempt, ok := s.attemptOr404(w, r)
	if !ok {
		return
	}
	noteID, cardID, ok := cardParams(w, r)
	if !ok {
		return
	}

	rows, err := s.store.Q().ListAttemptQuestions(r.Context(), gen.ListAttemptQuestionsParams{
		AttemptID: attempt.ID, UserID: user.ID,
	})
	if err != nil {
		writeInternal(w, err)
		return
	}
	for _, row := range rows {
		if row.NoteID == noteID && row.CardID == cardID {
			if row.Back == nil || row.DeletedAt != nil {
				writeNotFound(w)
				return
			}
			writeJSON(w, http.StatusOK, answerResponse{Back: *row.Back})
			return
		}
	}
	writeNotFound(w)
}

// handleAnswerQuestion records one exam answer.
//
// It writes review_logs and deliberately does not touch card_schedules
// (D-049). The insert is idempotent against the partial unique index, so a
// double-submitted rating cannot inflate the score.
func (s *Server) handleAnswerQuestion(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	attempt, ok := s.attemptOr404(w, r)
	if !ok {
		return
	}
	if attempt.FinishedAt != nil {
		writeError(w, http.StatusConflict, CodeConflict, "Ujian ini sudah selesai.")
		return
	}
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

	belongs, err := s.store.Q().AttemptHasQuestion(r.Context(), gen.AttemptHasQuestionParams{
		AttemptID: attempt.ID, UserID: user.ID, NoteID: noteID, CardID: cardID,
	})
	if err != nil {
		writeInternal(w, err)
		return
	}
	if !belongs {
		writeNotFound(w)
		return
	}

	// The card's current interval, recorded on both sides of the log because
	// the schedule did not move. A card whose note has since been deleted has
	// no schedule to read; zero is the honest answer there.
	var interval int32
	row, err := s.store.Q().GetCardWithSchedule(r.Context(), gen.GetCardWithScheduleParams{
		NoteID: noteID, ID: cardID, UserID: user.ID,
	})
	if err == nil {
		interval = intervalDays(srs.Schedule{
			Stage:      int(row.CardSchedule.Stage),
			NextReview: store.FromTimePtr(row.CardSchedule.NextReviewDate),
			State:      srs.State(row.CardSchedule.State),
		})
	} else if !errors.Is(err, pgx.ErrNoRows) {
		writeInternal(w, err)
		return
	}

	if err := s.store.Q().InsertExamAnswer(r.Context(), gen.InsertExamAnswerParams{
		NoteID:        noteID,
		CardID:        cardID,
		UserID:        user.ID,
		Rating:        string(rating),
		IntervalDays:  interval,
		ExamAttemptID: &attempt.ID,
	}); err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

func (s *Server) handleFinishAttempt(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	attempt, ok := s.attemptOr404(w, r)
	if !ok {
		return
	}

	finished, err := s.store.Q().FinishAttempt(r.Context(), gen.FinishAttemptParams{
		ID: attempt.ID, UserID: user.ID,
	})
	// No rows means it was already finished. Finishing twice is what a
	// double-tap on "selesai" looks like, so hand back what is stored rather
	// than an error.
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, toAttemptResponse(attempt))
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusOK, toAttemptResponse(finished))
}

// handleDeleteAttempt discards a run. The answers stay in review_logs with a
// null attempt id: a discarded practice run may not erase retention evidence
// (D-050).
func (s *Server) handleDeleteAttempt(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, err := uuid.Parse(chi.URLParam(r, "attemptID"))
	if err != nil {
		writeNotFound(w)
		return
	}

	rows, err := s.store.Q().DeleteAttempt(r.Context(), gen.DeleteAttemptParams{ID: id, UserID: user.ID})
	if err != nil {
		writeInternal(w, err)
		return
	}
	if rows == 0 {
		writeNotFound(w)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

func (s *Server) attemptOr404(w http.ResponseWriter, r *http.Request) (gen.ExamAttempt, bool) {
	user, _ := UserFrom(r.Context())

	id, err := uuid.Parse(chi.URLParam(r, "attemptID"))
	if err != nil {
		writeNotFound(w)
		return gen.ExamAttempt{}, false
	}

	attempt, err := s.store.Q().GetAttempt(r.Context(), gen.GetAttemptParams{ID: id, UserID: user.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return gen.ExamAttempt{}, false
	}
	if err != nil {
		writeInternal(w, err)
		return gen.ExamAttempt{}, false
	}
	return attempt, true
}
