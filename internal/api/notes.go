package api

import (
	"errors"
	"net/http"
	"strconv"
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

// These endpoints are tool-shaped on purpose: the same four operations become
// MCP tools in v0.3, so they take and return whole notes rather than being
// screen-specific (D-017).

const (
	maxTitleLen   = 200
	maxContentLen = 256 << 10 // a quarter-megabyte of markdown per note
	defaultLimit  = 50
	maxLimit      = 200
)

type noteRequest struct {
	// Pointers so PATCH can tell "not sent" from "sent empty". Absent fields
	// keep their stored value.
	Title     *string `json:"title"`
	ContentMd *string `json:"contentMd"`
	DomainID  *string `json:"domainId"`
}

type noteResponse struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	ContentMd string    `json:"contentMd"`
	DomainID  *string   `json:"domainId"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// noteSummary is the list shape. It omits contentMd deliberately: the list
// screen shows a title, a date and a card count, and shipping every note's
// full markdown to render that is pure waste.
type noteSummary struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	DomainID  *string   `json:"domainId"`
	CardCount int64     `json:"cardCount"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func toNoteResponse(n gen.Note) noteResponse {
	return noteResponse{
		ID:        n.ID.String(),
		Title:     n.Title,
		ContentMd: n.ContentMd,
		DomainID:  uuidString(n.DomainID),
		CreatedAt: n.CreatedAt,
		UpdatedAt: n.UpdatedAt,
	}
}

// uuidString renders an optional uuid for JSON. Domains stopped being text
// slugs when they became per-user (D-046), but the wire contract stays a
// string — it is now a uuid string rather than "math".
func uuidString(id *uuid.UUID) *string {
	if id == nil {
		return nil
	}
	s := id.String()
	return &s
}

func (s *Server) handleCreateNote(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	var req noteRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	title := strings.TrimSpace(deref(req.Title))
	content := deref(req.ContentMd)
	if !s.validNote(w, title, content) {
		return
	}
	domainID, ok := s.parseDomain(w, r, req.DomainID)
	if !ok {
		return
	}
	// An untitled note is a normal thing to create — the capture dialog (A7)
	// is one field and no title at all. Deriving one costs nothing and keeps
	// capture friction at zero, which matters more than a tidy required field.
	if title == "" {
		title = deriveTitle(content)
	}

	saved, err := s.store.CreateNoteWithCards(r.Context(), user.ID, store.NoteInput{
		Title:     title,
		ContentMd: content,
		DomainID:  domainID,
	}, srs.Today(time.Now()))
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, toNoteResponse(saved.Note))
}

func (s *Server) handleGetNote(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := noteIDParam(w, r)
	if !ok {
		return
	}

	note, err := s.store.Q().GetNote(r.Context(), gen.GetNoteParams{ID: id, UserID: user.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusOK, toNoteResponse(note))
}

// handleUpdateNote saves a note and syncs its cards in one transaction (C3).
//
// The response carries the *stored* markdown, which is not always what was
// submitted: the parser writes IDs into new cards. The editor replaces its
// buffer with this, and without it the next save would look like a fresh set
// of cards every time.
func (s *Server) handleUpdateNote(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := noteIDParam(w, r)
	if !ok {
		return
	}

	var req noteRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	// PATCH is partial, and gen.UpdateNote replaces the whole row, so fields
	// the client left out are filled from the stored note. This read also
	// gives the 404 before any work happens.
	current, err := s.store.Q().GetNote(r.Context(), gen.GetNoteParams{ID: id, UserID: user.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	in := store.NoteInput{
		Title:     current.Title,
		ContentMd: current.ContentMd,
		DomainID:  current.DomainID,
	}
	if req.Title != nil {
		in.Title = strings.TrimSpace(*req.Title)
	}
	if req.ContentMd != nil {
		in.ContentMd = *req.ContentMd
	}
	if req.DomainID != nil {
		domainID, ok := s.parseDomain(w, r, req.DomainID)
		if !ok {
			return
		}
		in.DomainID = domainID
	}

	if !s.validNote(w, in.Title, in.ContentMd) {
		return
	}
	if in.Title == "" {
		in.Title = deriveTitle(in.ContentMd)
	}

	saved, err := s.store.UpdateNoteWithCards(r.Context(), user.ID, id, in, srs.Today(time.Now()))
	if errors.Is(err, store.ErrNoteNotFound) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusOK, toNoteResponse(saved.Note))
}

func (s *Server) handleListNotes(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	limit := intParam(r, "limit", defaultLimit, 1, maxLimit)
	offset := intParam(r, "offset", 0, 0, 1<<30)

	rows, err := s.store.Q().ListNotes(r.Context(), gen.ListNotesParams{
		UserID: user.ID,
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	out := make([]noteSummary, 0, len(rows))
	for _, n := range rows {
		out = append(out, noteSummary{
			ID:        n.ID.String(),
			Title:     n.Title,
			DomainID:  uuidString(n.DomainID),
			CardCount: n.CardCount,
			UpdatedAt: n.UpdatedAt,
		})
	}

	writeJSON(w, http.StatusOK, out)
}

// validNote checks what the database cannot express as a clean error. A
// hand-written check rather than struct tags: eight endpoints do not justify a
// validation framework (D-045).
func (s *Server) validNote(w http.ResponseWriter, title, content string) bool {
	if utf8.RuneCountInString(title) > maxTitleLen {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Judul terlalu panjang.")
		return false
	}
	if len(content) > maxContentLen {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Catatan terlalu panjang.")
		return false
	}
	return true
}

// parseDomain turns the wire's optional domainId into a uuid, and reports
// whether it is one of this user's live domains.
//
// It is not what enforces tenancy — the composite foreign key on notes is
// (D-047), and it holds even if this check is forgotten. This exists so an
// unknown or someone else's domain comes back as a 400 with Indonesian copy
// instead of a constraint violation surfacing as a 500.
//
// An unknown domain and another user's domain give the same answer, so the
// endpoint cannot be used to discover whether a domain exists (D-039).
func (s *Server) parseDomain(w http.ResponseWriter, r *http.Request, raw *string) (*uuid.UUID, bool) {
	if raw == nil || *raw == "" {
		return nil, true
	}

	id, err := uuid.Parse(*raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Domain tidak dikenal.")
		return nil, false
	}

	user, _ := UserFrom(r.Context())
	exists, err := s.store.Q().DomainExists(r.Context(), gen.DomainExistsParams{
		ID:     id,
		UserID: user.ID,
	})
	if err != nil {
		writeInternal(w, err)
		return nil, false
	}
	if !exists {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Domain tidak dikenal.")
		return nil, false
	}
	return &id, true
}

// deriveTitle takes the first line that carries text. A card line is trimmed
// to its front, because "Apa itu prior?" is a better title than the whole
// question-and-answer pair.
func deriveTitle(md string) string {
	const fallback = "Tanpa judul"

	for _, line := range strings.Split(md, "\n") {
		line = strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "#>-* "))
		if line == "" {
			continue
		}
		if front, _, found := strings.Cut(line, "::"); found {
			line = strings.TrimSpace(front)
		}
		if line == "" {
			continue
		}
		return truncate(line, 80)
	}
	return fallback
}

func truncate(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return strings.TrimSpace(string(runes[:max])) + "…"
}

// noteIDParam parses the path parameter. A string that cannot be a UUID cannot
// name a note, so it gets the same answer as a note that is not there — never
// a hint that the format was the problem (D-039).
func noteIDParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeNotFound(w)
		return uuid.UUID{}, false
	}
	return id, true
}

func intParam(r *http.Request, name string, def, min, max int) int {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
