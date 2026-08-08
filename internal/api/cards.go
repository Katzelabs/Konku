package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/srs"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Cards are their own resource with their own CRUD (D-055). They used to exist
// only as `Q :: A` lines inside a note, reachable through the note that
// contained them; there is no note in the picture any more.
//
// These are tool-shaped for the same reason the note endpoints are: in v0.3
// add_card becomes an MCP tool over exactly this (D-017).

const (
	// Both sides are markdown now and may span lines, so the old one-line
	// limit is meaningless. Generous, but bounded — a card is a prompt, and
	// anything approaching this is a note wearing the wrong shape.
	maxCardSideLen = 16 << 10
	cardListLimit  = 500
)

type cardRequest struct {
	// Pointers so PATCH can tell "not sent" from "sent empty".
	Front       *string   `json:"front"`
	Back        *string   `json:"back"`
	DomainID    *string   `json:"domainId"`
	CategoryIDs *[]string `json:"categoryIds"`
}

type cardResponse struct {
	ID          string    `json:"id"`
	Front       string    `json:"front"`
	Back        string    `json:"back"`
	Type        string    `json:"type"`
	DomainID    *string   `json:"domainId"`
	CategoryIDs []string  `json:"categoryIds"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func toCardResponse(c gen.Card, categoryIDs []uuid.UUID) cardResponse {
	return cardResponse{
		ID:          c.ID.String(),
		Front:       c.Front,
		Back:        c.Back,
		Type:        c.Type,
		DomainID:    uuidString(c.DomainID),
		CategoryIDs: uuidStrings(categoryIDs),
		CreatedAt:   c.CreatedAt,
		UpdatedAt:   c.UpdatedAt,
	}
}

// cardSummary is the list shape: the prompt side, never the answer.
//
// Withholding `back` here is not only about the exam picker, which this list
// also serves. It is the D-003 guarantee held one level lower than the review
// screen: if every answer ships with every list, recall-before-reveal is one
// dev-tools glance from being defeated on a page the user visits daily. The
// editor fetches a single card when it needs the answer.
type cardSummary struct {
	ID          string    `json:"id"`
	Front       string    `json:"front"`
	Type        string    `json:"type"`
	DomainID    *string   `json:"domainId"`
	CategoryIDs []string  `json:"categoryIds"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// handleListCards is the Cards page, and also the picker when pinning a fixed
// exam's questions — one list with filters serves both.
func (s *Server) handleListCards(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	domainID, ok := optionalUUIDQuery(w, r, "domainId")
	if !ok {
		return
	}
	categoryID, ok := optionalUUIDQuery(w, r, "categoryId")
	if !ok {
		return
	}

	var query *string
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		query = &q
	}

	rows, err := s.store.Q().ListCards(r.Context(), gen.ListCardsParams{
		UserID:     user.ID,
		DomainID:   domainID,
		CategoryID: categoryID,
		Query:      query,
		Limit:      int32(intParam(r, "limit", cardListLimit, 1, cardListLimit)),
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	out := make([]cardSummary, 0, len(rows))
	for _, c := range rows {
		out = append(out, cardSummary{
			ID:          c.ID.String(),
			Front:       c.Front,
			Type:        c.Type,
			DomainID:    uuidString(c.DomainID),
			CategoryIDs: uuidStrings(c.CategoryIds),
			CreatedAt:   c.CreatedAt,
			UpdatedAt:   c.UpdatedAt,
		})
	}

	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleCreateCard(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	var req cardRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	front := strings.TrimSpace(deref(req.Front))
	back := strings.TrimSpace(deref(req.Back))
	if !validCard(w, front, back) {
		return
	}
	domainID, ok := s.parseDomain(w, r, req.DomainID)
	if !ok {
		return
	}
	categoryIDs, ok := s.parseCategories(w, r, req.CategoryIDs)
	if !ok {
		return
	}

	// The user's local day, not the server's: a card captured at 23:00 belongs
	// to that day and is due the next one (hard rule 5).
	card, err := s.store.CreateCard(r.Context(), user.ID, store.CardInput{
		DomainID:    domainID,
		Front:       front,
		Back:        back,
		CategoryIDs: categoryIDs,
	}, srs.Today(time.Now()))
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, toCardResponse(card, categoryIDs))
}

func (s *Server) handleGetCard(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := idParam(w, r)
	if !ok {
		return
	}

	card, err := s.store.Q().GetCard(r.Context(), gen.GetCardParams{ID: id, UserID: user.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	categoryIDs, ok := s.cardCategoryIDs(w, r, id)
	if !ok {
		return
	}

	writeJSON(w, http.StatusOK, toCardResponse(card, categoryIDs))
}

func (s *Server) handleUpdateCard(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := idParam(w, r)
	if !ok {
		return
	}

	var req cardRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	// PATCH is partial and UpdateCard replaces the row, so absent fields come
	// from the stored card. This read also gives the 404 before any work.
	current, err := s.store.Q().GetCard(r.Context(), gen.GetCardParams{ID: id, UserID: user.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	stored, ok := s.cardCategoryIDs(w, r, id)
	if !ok {
		return
	}

	in := store.CardInput{
		DomainID:    current.DomainID,
		Front:       current.Front,
		Back:        current.Back,
		CategoryIDs: stored,
	}
	if req.Front != nil {
		in.Front = strings.TrimSpace(*req.Front)
	}
	if req.Back != nil {
		in.Back = strings.TrimSpace(*req.Back)
	}
	if req.DomainID != nil {
		domainID, ok := s.parseDomain(w, r, req.DomainID)
		if !ok {
			return
		}
		in.DomainID = domainID
	}
	if req.CategoryIDs != nil {
		categoryIDs, ok := s.parseCategories(w, r, req.CategoryIDs)
		if !ok {
			return
		}
		in.CategoryIDs = categoryIDs
	}

	if !validCard(w, in.Front, in.Back) {
		return
	}

	card, err := s.store.UpdateCard(r.Context(), user.ID, id, in)
	if errors.Is(err, store.ErrCardNotFound) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusOK, toCardResponse(card, in.CategoryIDs))
}

// handleDeleteCard soft-deletes. The schedule and the review history stay, so
// restoring is a real undo rather than a fresh card wearing the old wording.
func (s *Server) handleDeleteCard(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := idParam(w, r)
	if !ok {
		return
	}

	err := s.store.DeleteCard(r.Context(), user.ID, id)
	if errors.Is(err, store.ErrCardNotFound) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

func (s *Server) handleRestoreCard(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := idParam(w, r)
	if !ok {
		return
	}

	err := s.store.RestoreCard(r.Context(), user.ID, id)
	if errors.Is(err, store.ErrCardNotFound) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

// cardCategoryIDs reads a card's current labels.
func (s *Server) cardCategoryIDs(w http.ResponseWriter, r *http.Request, cardID uuid.UUID) ([]uuid.UUID, bool) {
	user, _ := UserFrom(r.Context())

	rows, err := s.store.Q().ListCategoriesForCard(r.Context(), gen.ListCategoriesForCardParams{
		CardID: cardID, UserID: user.ID,
	})
	if err != nil {
		writeInternal(w, err)
		return nil, false
	}

	out := make([]uuid.UUID, 0, len(rows))
	for _, c := range rows {
		out = append(out, c.ID)
	}
	return out, true
}

// validCard requires both sides. A card with no answer cannot be reviewed —
// it would surface in the due list forever and never teach anything — and one
// with no prompt cannot be asked.
func validCard(w http.ResponseWriter, front, back string) bool {
	if front == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Pertanyaan tidak boleh kosong.")
		return false
	}
	if back == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Jawaban tidak boleh kosong.")
		return false
	}
	if len(front) > maxCardSideLen || len(back) > maxCardSideLen {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Kartu terlalu panjang.")
		return false
	}
	return true
}

// idParam parses the {id} path parameter for any resource keyed on a uuid.
// Unparseable gets the same answer as absent: a string that cannot be an id
// names nothing, and "malformed" would be a different answer from "not yours"
// (D-039).
func idParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeNotFound(w)
		return uuid.UUID{}, false
	}
	return id, true
}
