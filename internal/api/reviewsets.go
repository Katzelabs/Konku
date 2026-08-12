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

// A review set is a saved configuration for a review over cards that already
// exist (D-048, absorbed into Ulangan by D-075). The other way into a review is
// the scheduled due queue in review.go, which needs no configuration.
//
// Three things here are load-bearing and easy to undo by accident:
//
//   - The question list never carries the answer, and never carries which
//     option is correct. Recall before reveal is what separates a retention
//     system from a list of things you once wrote down (D-003).
//   - Answering does not move the schedule. It is written to review_logs with
//     source 'set' and card_schedules is left alone (D-049). A bad practice run
//     must not cost a month of real progress (rule 6).
//   - A multiple-choice answer is graded on the server. The client is told
//     whether it was right, after it has committed.

const (
	maxSetTitleLen = 200
	maxSetDescLen  = 2000
	maxQuestions   = 100
	maxTimeLimit   = 480
	maxSetDomains  = 20
	runsPerPage    = 20
)

type reviewSetRequest struct {
	Title            *string   `json:"title"`
	Description      *string   `json:"description"`
	Selection        *string   `json:"selection"`
	QuestionCount    *int32    `json:"questionCount"`
	TimeLimitMinutes *int32    `json:"timeLimitMinutes"`
	Format           *string   `json:"format"`
	DomainIDs        *[]string `json:"domainIds"`
	CategoryIDs      *[]string `json:"categoryIds"`
}

type reviewSetResponse struct {
	ID               string    `json:"id"`
	Title            string    `json:"title"`
	Description      string    `json:"description"`
	Selection        string    `json:"selection"`
	QuestionCount    *int32    `json:"questionCount"`
	TimeLimitMinutes *int32    `json:"timeLimitMinutes"`
	Format           string    `json:"format"`
	DomainIDs        []string  `json:"domainIds"`
	CategoryIDs      []string  `json:"categoryIds"`
	RunCount         int64     `json:"runCount"`
	Archived         bool      `json:"archived"`
	CreatedAt        time.Time `json:"createdAt"`
}

// toSetResponse builds the wire shape from the base row plus the pieces that
// live outside it. runCount is passed in because only the list and detail
// queries compute it; a write path knows nothing has changed and passes what
// it read.
func toSetResponse(s gen.ReviewSet, domains, categories []uuid.UUID, runCount int64) reviewSetResponse {
	return reviewSetResponse{
		ID:               s.ID.String(),
		Title:            s.Title,
		Description:      s.Description,
		Selection:        s.Selection,
		QuestionCount:    s.QuestionCount,
		TimeLimitMinutes: s.TimeLimitMinutes,
		Format:           s.Format,
		DomainIDs:        uuidStrings(domains),
		CategoryIDs:      uuidStrings(categories),
		RunCount:         runCount,
		Archived:         s.ArchivedAt != nil,
		CreatedAt:        s.CreatedAt,
	}
}

func (s *Server) handleListReviewSets(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	rows, err := scoped(s, r, func(q *gen.Queries) ([]gen.ListReviewSetsRow, error) {
		return q.ListReviewSets(r.Context(), gen.ListReviewSetsParams{
			UserID:   user.ID,
			Archived: r.URL.Query().Get("archived") == "true",
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	out := make([]reviewSetResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toSetResponse(setFromListRow(row), row.DomainIds, row.CategoryIds, row.RunCount))
	}

	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetReviewSet(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	set, ok := s.setOr404(w, r)
	if !ok {
		return
	}

	runs, err := scoped(s, r, func(q *gen.Queries) ([]gen.ReviewRun, error) {
		return q.ListRuns(r.Context(), gen.ListRunsParams{
			SetID: set.ID, UserID: user.ID, Limit: runsPerPage,
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	out := struct {
		reviewSetResponse
		Runs []runResponse `json:"runs"`
		// The pinned set, for a 'fixed' set. Empty for 'random', whose
		// questions only exist once a run draws them.
		Cards []pinnedCard `json:"cards"`
	}{
		// RunCount comes from the query's own count, not len(runs): that list
		// is capped at runsPerPage and includes an unfinished run, so using its
		// length would make the same field mean something different here than
		// it does in the list.
		reviewSetResponse: toSetResponse(setFromDetailRow(set), set.DomainIds, set.CategoryIds, set.RunCount),
		Runs:              make([]runResponse, 0, len(runs)),
		Cards:             []pinnedCard{},
	}
	for _, a := range runs {
		out.Runs = append(out.Runs, toRunResponse(a))
	}

	if set.Selection == "fixed" {
		pinned, err := scoped(s, r, func(q *gen.Queries) ([]gen.ListSetCardsRow, error) {
			return q.ListSetCards(r.Context(), gen.ListSetCardsParams{
				SetID: set.ID, UserID: user.ID,
			})
		})
		if err != nil {
			writeInternal(w, r, err)
			return
		}
		for _, c := range pinned {
			out.Cards = append(out.Cards, pinnedCard{
				CardID: c.CardID.String(), Front: c.Front,
			})
		}
	}

	writeJSON(w, http.StatusOK, out)
}

type pinnedCard struct {
	CardID string `json:"cardId"`
	Front  string `json:"front"`
}

func (s *Server) handleCreateReviewSet(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	var req reviewSetRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	title := strings.TrimSpace(deref(req.Title))
	selection := strings.TrimSpace(deref(req.Selection))
	if selection == "" {
		selection = "random"
	}
	format := strings.TrimSpace(deref(req.Format))
	if format == "" {
		format = store.FormatRecall
	}
	if !validReviewSet(w, title, deref(req.Description), selection, format,
		req.QuestionCount, req.TimeLimitMinutes) {
		return
	}
	domains, ok := s.parseDomains(w, r, req.DomainIDs)
	if !ok {
		return
	}
	categories, ok := s.parseCategories(w, r, req.CategoryIDs)
	if !ok {
		return
	}

	// The set and its filter links commit together, the same rule a note and
	// its categories follow (hard rule 3). A set whose filters half-saved would
	// draw from the wrong cards without looking broken.
	var created gen.ReviewSet
	err := scopedExec(s, r, func(q *gen.Queries) error {
		set, err := q.CreateReviewSet(r.Context(), gen.CreateReviewSetParams{
			UserID:           user.ID,
			Title:            title,
			Description:      deref(req.Description),
			Selection:        selection,
			QuestionCount:    questionCountFor(selection, req.QuestionCount),
			TimeLimitMinutes: req.TimeLimitMinutes,
			Format:           format,
		})
		if err != nil {
			return err
		}
		created = set
		return writeSetFilters(r, q, user.ID, set.ID, domains, categories)
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusCreated, toSetResponse(created, domains, categories, 0))
}

func (s *Server) handleUpdateReviewSet(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	current, ok := s.setOr404(w, r)
	if !ok {
		return
	}

	var req reviewSetRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	title, desc, selection := current.Title, current.Description, current.Selection
	count, limit, format := current.QuestionCount, current.TimeLimitMinutes, current.Format
	domains, categories := current.DomainIds, current.CategoryIds

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
	if req.Format != nil {
		format = strings.TrimSpace(*req.Format)
	}
	if req.DomainIDs != nil {
		parsed, ok := s.parseDomains(w, r, req.DomainIDs)
		if !ok {
			return
		}
		domains = parsed
	}
	if req.CategoryIDs != nil {
		parsed, ok := s.parseCategories(w, r, req.CategoryIDs)
		if !ok {
			return
		}
		categories = parsed
	}

	if !validReviewSet(w, title, desc, selection, format, count, limit) {
		return
	}

	var updated gen.ReviewSet
	err := scopedExec(s, r, func(q *gen.Queries) error {
		set, err := q.UpdateReviewSet(r.Context(), gen.UpdateReviewSetParams{
			ID:               current.ID,
			UserID:           user.ID,
			Title:            title,
			Description:      desc,
			Selection:        selection,
			QuestionCount:    questionCountFor(selection, count),
			TimeLimitMinutes: limit,
			Format:           format,
		})
		if err != nil {
			return err
		}
		updated = set
		if req.DomainIDs == nil && req.CategoryIDs == nil {
			return nil
		}
		return writeSetFilters(r, q, user.ID, set.ID, domains, categories)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, toSetResponse(updated, domains, categories, current.RunCount))
}

// writeSetFilters replaces both filter lists. Replace rather than diff: the
// client sends the filters it wants, which makes adding and removing one
// request instead of a protocol.
func writeSetFilters(
	r *http.Request,
	q *gen.Queries,
	userID, setID uuid.UUID,
	domains, categories []uuid.UUID,
) error {
	if err := q.ClearSetDomains(r.Context(), gen.ClearSetDomainsParams{
		SetID: setID, UserID: userID,
	}); err != nil {
		return err
	}
	for _, id := range domains {
		if err := q.AddSetDomain(r.Context(), gen.AddSetDomainParams{
			UserID: userID, SetID: setID, DomainID: id,
		}); err != nil {
			return err
		}
	}
	if err := q.ClearSetCategories(r.Context(), gen.ClearSetCategoriesParams{
		SetID: setID, UserID: userID,
	}); err != nil {
		return err
	}
	for _, id := range categories {
		if err := q.AddSetCategory(r.Context(), gen.AddSetCategoryParams{
			UserID: userID, SetID: setID, CategoryID: id,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) handleArchiveReviewSet(w http.ResponseWriter, r *http.Request) {
	s.setArchive(w, r, true)
}

func (s *Server) handleUnarchiveReviewSet(w http.ResponseWriter, r *http.Request) {
	s.setArchive(w, r, false)
}

func (s *Server) setArchive(w http.ResponseWriter, r *http.Request, archive bool) {
	user, _ := UserFrom(r.Context())

	id, ok := setIDParam(w, r)
	if !ok {
		return
	}

	set, err := scoped(s, r, func(q *gen.Queries) (gen.ReviewSet, error) {
		if archive {
			return q.ArchiveReviewSet(r.Context(), gen.ArchiveReviewSetParams{ID: id, UserID: user.ID})
		}
		return q.UnarchiveReviewSet(r.Context(), gen.UnarchiveReviewSetParams{ID: id, UserID: user.ID})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	filters, ok := s.readSetFilters(w, r, set.ID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toSetResponse(set, filters.domains, filters.categories, filters.runCount))
}

// handleDeleteReviewSet only succeeds for a set that was never run. One with
// runs raises foreign_key_violation, because deleting it would destroy the
// score history while the answers survive in review_logs (D-051).
func (s *Server) handleDeleteReviewSet(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := setIDParam(w, r)
	if !ok {
		return
	}

	rows, err := scoped(s, r, func(q *gen.Queries) (int64, error) {
		return q.DeleteReviewSet(r.Context(), gen.DeleteReviewSetParams{ID: id, UserID: user.ID})
	})
	if isForeignKeyViolation(err) {
		writeError(w, http.StatusConflict, CodeConflict,
			"Latihan ini sudah pernah dikerjakan. Arsipkan saja.")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	if rows == 0 {
		writeNotFound(w)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

type setCardRef struct {
	CardID string `json:"cardId"`
}

// handleSetReviewSetCards replaces the pinned question set of a 'fixed' set.
//
// Replace rather than append: the client sends the set it wants, which makes
// reordering and removal one request instead of a diff protocol.
func (s *Server) handleSetReviewSetCards(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	set, ok := s.setOr404(w, r)
	if !ok {
		return
	}
	if set.Selection != "fixed" {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Hanya latihan dengan soal tetap yang punya daftar kartu.")
		return
	}

	var req struct {
		Cards []setCardRef `json:"cards"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Cards) > maxQuestions {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Terlalu banyak soal.")
		return
	}

	err := scopedExec(s, r, func(q *gen.Queries) error {
		if err := q.ClearSetCards(r.Context(), gen.ClearSetCardsParams{
			SetID: set.ID, UserID: user.ID,
		}); err != nil {
			return err
		}
		for i, c := range req.Cards {
			cardID, err := uuid.Parse(c.CardID)
			if err != nil {
				return errBadCardRef
			}
			if err := q.AddSetCard(r.Context(), gen.AddSetCardParams{
				SetID:    set.ID,
				UserID:   user.ID,
				CardID:   cardID,
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
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

var errBadCardRef = errors.New("api: unparseable card reference")

func validReviewSet(w http.ResponseWriter, title, desc, selection, format string, count, limit *int32) bool {
	if title == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Judul latihan tidak boleh kosong.")
		return false
	}
	if utf8.RuneCountInString(title) > maxSetTitleLen {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Judul latihan terlalu panjang.")
		return false
	}
	if utf8.RuneCountInString(desc) > maxSetDescLen {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Deskripsi latihan terlalu panjang.")
		return false
	}
	if selection != "fixed" && selection != "random" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Jenis soal harus 'fixed' atau 'random'.")
		return false
	}
	if format != store.FormatRecall && format != store.FormatChoice {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Bentuk soal harus 'recall' atau 'choice'.")
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
// constraint ties them together, so sending a count on a fixed set would be a
// constraint violation rather than a 400 — drop it instead.
func questionCountFor(selection string, count *int32) *int32 {
	if selection == "fixed" {
		return nil
	}
	return count
}

// parseDomains turns the wire's optional domainIds into uuids and checks they
// are all this user's.
//
// Same division of labour as parseCategories: the composite foreign key is
// what enforces tenancy (D-047) and holds even if this is forgotten. This
// exists so an unknown or someone else's domain is a 400 with Indonesian copy
// rather than a constraint violation surfacing as a 500. Unknown and not-yours
// are the same answer (D-039).
func (s *Server) parseDomains(w http.ResponseWriter, r *http.Request, raw *[]string) ([]uuid.UUID, bool) {
	if raw == nil || len(*raw) == 0 {
		return nil, true
	}
	if len(*raw) > maxSetDomains {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Terlalu banyak domain.")
		return nil, false
	}

	user, _ := UserFrom(r.Context())

	seen := make(map[uuid.UUID]bool, len(*raw))
	out := make([]uuid.UUID, 0, len(*raw))
	for _, s2 := range *raw {
		id, err := uuid.Parse(s2)
		if err != nil {
			writeError(w, http.StatusBadRequest, CodeBadRequest, "Domain tidak dikenal.")
			return nil, false
		}
		if seen[id] {
			continue
		}
		seen[id] = true

		exists, err := scoped(s, r, func(q *gen.Queries) (bool, error) {
			return q.DomainExists(r.Context(), gen.DomainExistsParams{ID: id, UserID: user.ID})
		})
		if err != nil {
			writeInternal(w, r, err)
			return nil, false
		}
		if !exists {
			writeError(w, http.StatusBadRequest, CodeBadRequest, "Domain tidak dikenal.")
			return nil, false
		}
		out = append(out, id)
	}
	return out, true
}

// setFromListRow and setFromDetailRow exist because sqlc gives each query its
// own row struct even when the columns are the same.
func setFromListRow(row gen.ListReviewSetsRow) gen.ReviewSet {
	return gen.ReviewSet{
		ID:               row.ID,
		UserID:           row.UserID,
		Title:            row.Title,
		Description:      row.Description,
		Selection:        row.Selection,
		QuestionCount:    row.QuestionCount,
		TimeLimitMinutes: row.TimeLimitMinutes,
		Format:           row.Format,
		ArchivedAt:       row.ArchivedAt,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
}

func setFromDetailRow(row gen.GetReviewSetRow) gen.ReviewSet {
	return gen.ReviewSet{
		ID:               row.ID,
		UserID:           row.UserID,
		Title:            row.Title,
		Description:      row.Description,
		Selection:        row.Selection,
		QuestionCount:    row.QuestionCount,
		TimeLimitMinutes: row.TimeLimitMinutes,
		Format:           row.Format,
		ArchivedAt:       row.ArchivedAt,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
}

type setFilterView struct {
	domains    []uuid.UUID
	categories []uuid.UUID
	runCount   int64
}

// readSetFilters re-reads a set purely for the pieces that do not come back
// from a write. It returns false after writing an error.
func (s *Server) readSetFilters(w http.ResponseWriter, r *http.Request, id uuid.UUID) (setFilterView, bool) {
	user, _ := UserFrom(r.Context())

	row, err := scoped(s, r, func(q *gen.Queries) (gen.GetReviewSetRow, error) {
		return q.GetReviewSet(r.Context(), gen.GetReviewSetParams{ID: id, UserID: user.ID})
	})
	if err != nil {
		writeInternal(w, r, err)
		return setFilterView{}, false
	}
	return setFilterView{
		domains:    row.DomainIds,
		categories: row.CategoryIds,
		runCount:   row.RunCount,
	}, true
}

// setOr404 loads a live set. An archived one is 404 on every path that acts on
// it — it is retired, and pretending otherwise would let a run start on
// something the user put away.
func (s *Server) setOr404(w http.ResponseWriter, r *http.Request) (gen.GetReviewSetRow, bool) {
	user, _ := UserFrom(r.Context())

	id, ok := setIDParam(w, r)
	if !ok {
		return gen.GetReviewSetRow{}, false
	}

	set, err := scoped(s, r, func(q *gen.Queries) (gen.GetReviewSetRow, error) {
		return q.GetReviewSet(r.Context(), gen.GetReviewSetParams{ID: id, UserID: user.ID})
	})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && set.ArchivedAt != nil) {
		writeNotFound(w)
		return gen.GetReviewSetRow{}, false
	}
	if err != nil {
		writeInternal(w, r, err)
		return gen.GetReviewSetRow{}, false
	}
	return set, true
}

func setIDParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeNotFound(w)
		return uuid.UUID{}, false
	}
	return id, true
}

// Runs.

type runResponse struct {
	ID           string     `json:"id"`
	SetID        string     `json:"setId"`
	StartedAt    time.Time  `json:"startedAt"`
	FinishedAt   *time.Time `json:"finishedAt"`
	RunDate      string     `json:"runDate"`
	TotalCount   int32      `json:"totalCount"`
	CorrectCount int32      `json:"correctCount"`
}

func toRunResponse(a gen.ReviewRun) runResponse {
	return runResponse{
		ID:           a.ID.String(),
		SetID:        a.SetID.String(),
		StartedAt:    a.StartedAt,
		FinishedAt:   a.FinishedAt,
		RunDate:      string(store.FromTime(a.RunDate)),
		TotalCount:   a.TotalCount,
		CorrectCount: a.CorrectCount,
	}
}

// questionResponse carries the prompt, and for a choice question its options.
// It never carries the answer text and never carries which option is right:
// revealing is a separate request the user makes after committing (D-003).
type questionResponse struct {
	Position int32   `json:"position"`
	CardID   string  `json:"cardId"`
	Front    string  `json:"front"`
	Rating   *string `json:"rating"`
	// Options is empty for a recall question, and for a choice question the
	// draw could not find enough distinct distractors for.
	Options []string `json:"options"`
	// Missing reports a card deleted after the run began. It still occupies its
	// position in the score.
	Missing bool `json:"missing"`
}

type runDetail struct {
	runResponse
	Questions []questionResponse `json:"questions"`
}

type startRunRequest struct {
	// RunDate is the client's LOCAL calendar date as YYYY-MM-DD, for the same
	// reason focus sessions carry one.
	RunDate string `json:"runDate"`
}

func (s *Server) handleStartRun(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := setIDParam(w, r)
	if !ok {
		return
	}

	var req startRunRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	date, err := store.ToTime(srs.Date(req.RunDate))
	if err != nil {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Tanggal tidak valid.")
		return
	}
	if !withinClockSkew(date, time.Now()) {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Tanggal terlalu jauh dari hari ini. Cek jam di perangkat kamu.")
		return
	}

	started, err := s.store.StartRun(r.Context(), user.ID, id, date)
	if errors.Is(err, store.ErrReviewSetNotFound) {
		writeNotFound(w)
		return
	}
	if errors.Is(err, store.ErrReviewSetHasNoCards) {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Belum ada kartu yang cocok dengan filter ini. Longgarkan filternya atau tulis kartu dulu.")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	detail := s.runDetailFor(w, r, started.Run)
	if detail == nil {
		return
	}

	// A resumed run is 200, a fresh one 201, so the client can tell "carried
	// on" from "started" without comparing timestamps.
	status := http.StatusCreated
	if started.Resumed {
		status = http.StatusOK
	}
	writeJSON(w, status, detail)
}

func (s *Server) handleGetRun(w http.ResponseWriter, r *http.Request) {
	run, ok := s.runOr404(w, r)
	if !ok {
		return
	}
	detail := s.runDetailFor(w, r, run)
	if detail == nil {
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

// runDetailFor loads the question set. It returns nil after writing an error,
// so callers must check before writing their own response.
func (s *Server) runDetailFor(w http.ResponseWriter, r *http.Request, a gen.ReviewRun) *runDetail {
	user, _ := UserFrom(r.Context())

	rows, err := scoped(s, r, func(q *gen.Queries) ([]gen.ListRunQuestionsRow, error) {
		return q.ListRunQuestions(r.Context(), gen.ListRunQuestionsParams{
			RunID: a.ID, UserID: user.ID,
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return nil
	}

	out := &runDetail{
		runResponse: toRunResponse(a),
		Questions:   make([]questionResponse, 0, len(rows)),
	}
	for _, row := range rows {
		q := questionResponse{
			Position: row.Position,
			CardID:   row.CardID.String(),
			Rating:   row.Rating,
			Options:  row.Options,
		}
		if q.Options == nil {
			q.Options = []string{}
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

// handleRunAnswer reveals the back of one recall question, after the user has
// attempted recall (D-003).
//
// A choice question does not use this: committing to an option is the recall
// attempt, and the answer comes back on the response to that.
func (s *Server) handleRunAnswer(w http.ResponseWriter, r *http.Request) {
	run, ok := s.runOr404(w, r)
	if !ok {
		return
	}
	cardID, ok := cardParam(w, r)
	if !ok {
		return
	}

	question, ok := s.runQuestionOr404(w, r, run, cardID)
	if !ok {
		return
	}
	if question.Back == nil || question.DeletedAt != nil {
		writeNotFound(w)
		return
	}

	writeJSON(w, http.StatusOK, answerResponse{Back: *question.Back})
}

type answerQuestionRequest struct {
	// Rating is the self-assessment on a recall question.
	Rating string `json:"rating"`
	// Choice is the index into the question's options, for a choice question.
	// A pointer so that "not sent" is distinguishable from option 0.
	Choice *int32 `json:"choice"`
}

// answerQuestionResponse tells the user how they did. For a recall question
// they already know — they judged themselves — so only a choice question
// carries the reveal.
type answerQuestionResponse struct {
	Rating string `json:"rating"`
	// Back and CorrectIndex are set only for a choice question, where the user
	// has now committed and revealing is the point.
	Back         *string `json:"back"`
	CorrectIndex *int32  `json:"correctIndex"`
}

// handleAnswerQuestion records one answer inside a run.
//
// It writes review_logs and deliberately does not touch card_schedules
// (D-049). The insert is idempotent against the partial unique index, so a
// double-submitted answer cannot inflate the score.
func (s *Server) handleAnswerQuestion(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	run, ok := s.runOr404(w, r)
	if !ok {
		return
	}
	if run.FinishedAt != nil {
		writeError(w, http.StatusConflict, CodeConflict, "Latihan ini sudah selesai.")
		return
	}
	cardID, ok := cardParam(w, r)
	if !ok {
		return
	}

	var req answerQuestionRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	question, ok := s.runQuestionOr404(w, r, run, cardID)
	if !ok {
		return
	}

	// Which body shape is required is decided by the question, not the client.
	// A choice question graded from a self-reported rating would let anyone
	// score full marks without reading the options.
	isChoice := question.CorrectIndex != nil && len(question.Options) > 0

	var (
		rating   srs.Rating
		format   = store.FormatRecall
		resp     answerQuestionResponse
		correctI = question.CorrectIndex
	)

	if isChoice {
		format = store.FormatChoice
		if req.Choice == nil {
			writeError(w, http.StatusBadRequest, CodeBadRequest, "Pilih salah satu jawaban.")
			return
		}
		if *req.Choice < 0 || int(*req.Choice) >= len(question.Options) {
			writeError(w, http.StatusBadRequest, CodeBadRequest, "Pilihan tidak dikenal.")
			return
		}
		rating = srs.Lupa
		if *req.Choice == *correctI {
			rating = srs.Ingat
		}
		resp.Back = question.Back
		resp.CorrectIndex = correctI
	} else {
		rating = srs.Rating(req.Rating)
		if rating != srs.Ingat && rating != srs.Lupa {
			writeError(w, http.StatusBadRequest, CodeBadRequest, "Penilaian harus 'ingat' atau 'lupa'.")
			return
		}
	}
	resp.Rating = string(rating)

	// The card's current interval, recorded on both sides of the log because
	// the schedule did not move. A card deleted since the run began has no
	// schedule to read; zero is the honest answer there.
	var interval int32
	row, err := scoped(s, r, func(q *gen.Queries) (gen.GetCardWithScheduleRow, error) {
		return q.GetCardWithSchedule(r.Context(), gen.GetCardWithScheduleParams{
			ID: cardID, UserID: user.ID,
		})
	})
	if err == nil {
		interval = intervalDays(srs.Schedule{
			Stage:      int(row.CardSchedule.Stage),
			NextReview: store.FromTimePtr(row.CardSchedule.NextReviewDate),
			State:      srs.State(row.CardSchedule.State),
		})
	} else if !errors.Is(err, pgx.ErrNoRows) {
		writeInternal(w, r, err)
		return
	}

	if err := scopedExec(s, r, func(q *gen.Queries) error {
		return q.InsertSetAnswer(r.Context(), gen.InsertSetAnswerParams{
			CardID:       cardID,
			UserID:       user.ID,
			Rating:       string(rating),
			IntervalDays: interval,
			RunID:        &run.ID,
			Format:       format,
		})
	}); err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// runQuestionOr404 loads one question of a run. A card that is not part of the
// run is 404 — it also carries the answer and the correct option, which is why
// it is only ever called on a path the user has already committed to.
func (s *Server) runQuestionOr404(
	w http.ResponseWriter,
	r *http.Request,
	run gen.ReviewRun,
	cardID uuid.UUID,
) (gen.GetRunQuestionRow, bool) {
	user, _ := UserFrom(r.Context())

	question, err := scoped(s, r, func(q *gen.Queries) (gen.GetRunQuestionRow, error) {
		return q.GetRunQuestion(r.Context(), gen.GetRunQuestionParams{
			RunID: run.ID, UserID: user.ID, CardID: cardID,
		})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return gen.GetRunQuestionRow{}, false
	}
	if err != nil {
		writeInternal(w, r, err)
		return gen.GetRunQuestionRow{}, false
	}
	return question, true
}

func (s *Server) handleFinishRun(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	run, ok := s.runOr404(w, r)
	if !ok {
		return
	}

	finished, err := scoped(s, r, func(q *gen.Queries) (gen.ReviewRun, error) {
		return q.FinishRun(r.Context(), gen.FinishRunParams{
			ID: run.ID, UserID: user.ID,
		})
	})
	// No rows means it was already finished. Finishing twice is what a
	// double-tap on "selesai" looks like, so hand back what is stored rather
	// than an error.
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, toRunResponse(run))
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, toRunResponse(finished))
}

// handleDeleteRun discards a run. The answers stay in review_logs with a null
// run id: a discarded practice run may not erase retention evidence (D-050).
func (s *Server) handleDeleteRun(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, err := uuid.Parse(chi.URLParam(r, "runID"))
	if err != nil {
		writeNotFound(w)
		return
	}

	rows, err := scoped(s, r, func(q *gen.Queries) (int64, error) {
		return q.DeleteRun(r.Context(), gen.DeleteRunParams{ID: id, UserID: user.ID})
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	if rows == 0 {
		writeNotFound(w)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

func (s *Server) runOr404(w http.ResponseWriter, r *http.Request) (gen.ReviewRun, bool) {
	user, _ := UserFrom(r.Context())

	id, err := uuid.Parse(chi.URLParam(r, "runID"))
	if err != nil {
		writeNotFound(w)
		return gen.ReviewRun{}, false
	}

	run, err := scoped(s, r, func(q *gen.Queries) (gen.ReviewRun, error) {
		return q.GetRun(r.Context(), gen.GetRunParams{ID: id, UserID: user.ID})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return gen.ReviewRun{}, false
	}
	if err != nil {
		writeInternal(w, r, err)
		return gen.ReviewRun{}, false
	}
	return run, true
}
