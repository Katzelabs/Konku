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
	// keep their stored value; an empty array clears the categories, which is
	// why this is a pointer to a slice rather than a slice.
	Title       *string   `json:"title"`
	ContentMd   *string   `json:"contentMd"`
	DomainID    *string   `json:"domainId"`
	CategoryIDs *[]string `json:"categoryIds"`
}

type noteResponse struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	ContentMd   string    `json:"contentMd"`
	DomainID    *string   `json:"domainId"`
	CategoryIDs []string  `json:"categoryIds"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// noteSummary is the list shape. It omits contentMd deliberately: the list
// screen shows a title, a date and its labels, and shipping every note's full
// markdown to render that is pure waste.
//
// cardCount is gone with D-055 — a note no longer contains cards.
type noteSummary struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	DomainID    *string   `json:"domainId"`
	CategoryIDs []string  `json:"categoryIds"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func toNoteResponse(n gen.Note, categoryIDs []uuid.UUID) noteResponse {
	return noteResponse{
		ID:          n.ID.String(),
		Title:       n.Title,
		ContentMd:   n.ContentMd,
		DomainID:    uuidString(n.DomainID),
		CategoryIDs: uuidStrings(categoryIDs),
		CreatedAt:   n.CreatedAt,
		UpdatedAt:   n.UpdatedAt,
	}
}

// uuidStrings renders a list of ids for JSON, never nil: the client maps over
// it directly and a null would be a crash rather than an empty list.
func uuidStrings(ids []uuid.UUID) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.String())
	}
	return out
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
	// Checked on create only. A restore returns a row that already exists and
	// already counted, and an edit changes no count at all (07 L8).
	if !s.withinNoteQuota(w, r, user.ID) {
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
	// An untitled note is a normal thing to create — the capture dialog (A7)
	// is one field and no title at all. Deriving one costs nothing and keeps
	// capture friction at zero, which matters more than a tidy required field.
	if title == "" {
		title = deriveTitle(content)
	}

	note, err := s.store.CreateNote(r.Context(), user.ID, store.NoteInput{
		Title:       title,
		ContentMd:   content,
		DomainID:    domainID,
		CategoryIDs: categoryIDs,
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusCreated, toNoteResponse(note, categoryIDs))
}

func (s *Server) handleGetNote(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := noteIDParam(w, r)
	if !ok {
		return
	}

	note, err := scoped(s, r, func(q *gen.Queries) (gen.Note, error) {
		return q.GetNote(r.Context(), gen.GetNoteParams{ID: id, UserID: user.ID})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	categoryIDs, ok := s.noteCategoryIDs(w, r, id)
	if !ok {
		return
	}

	writeJSON(w, http.StatusOK, toNoteResponse(note, categoryIDs))
}

// noteCategoryIDs reads a note's current labels, for the response body and for
// the read-modify-write in the update path.
func (s *Server) noteCategoryIDs(w http.ResponseWriter, r *http.Request, noteID uuid.UUID) ([]uuid.UUID, bool) {
	user, _ := UserFrom(r.Context())

	rows, err := scoped(s, r, func(q *gen.Queries) ([]gen.Category, error) {
		return q.ListCategoriesForNote(r.Context(), gen.ListCategoriesForNoteParams{
			NoteID: noteID, UserID: user.ID,
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return nil, false
	}

	out := make([]uuid.UUID, 0, len(rows))
	for _, c := range rows {
		out = append(out, c.ID)
	}
	return out, true
}

// handleUpdateNote saves a note and its category links in one transaction.
//
// It used to sync cards parsed out of the markdown, and the response had to
// carry the *stored* markdown rather than the submitted markdown so the editor
// could pick up the IDs the parser had written in. D-055 removed both: the
// stored markdown is now exactly what was sent.
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
	current, err := scoped(s, r, func(q *gen.Queries) (gen.Note, error) {
		return q.GetNote(r.Context(), gen.GetNoteParams{ID: id, UserID: user.ID})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	// syncNoteCategories is total — it replaces the whole set — so an update
	// that does not mention categories has to resend the stored ones or they
	// would be wiped by omission.
	stored, ok := s.noteCategoryIDs(w, r, id)
	if !ok {
		return
	}

	in := store.NoteInput{
		Title:       current.Title,
		ContentMd:   current.ContentMd,
		DomainID:    current.DomainID,
		CategoryIDs: stored,
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
	if req.CategoryIDs != nil {
		categoryIDs, ok := s.parseCategories(w, r, req.CategoryIDs)
		if !ok {
			return
		}
		in.CategoryIDs = categoryIDs
	}

	if !s.validNote(w, in.Title, in.ContentMd) {
		return
	}
	if in.Title == "" {
		in.Title = deriveTitle(in.ContentMd)
	}

	note, err := s.store.UpdateNote(r.Context(), user.ID, id, in)
	if errors.Is(err, store.ErrNoteNotFound) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, toNoteResponse(note, in.CategoryIDs))
}

// handleDeleteNote soft-deletes. The note keeps its labels and can be restored
// from the Terhapus view, so this is recoverable rather than final — writing
// must not be destroyable in one click (00005).
func (s *Server) handleDeleteNote(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := noteIDParam(w, r)
	if !ok {
		return
	}

	err := s.store.DeleteNote(r.Context(), user.ID, id)
	if errors.Is(err, store.ErrNoteNotFound) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

func (s *Server) handleRestoreNote(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := noteIDParam(w, r)
	if !ok {
		return
	}

	err := s.store.RestoreNote(r.Context(), user.ID, id)
	if errors.Is(err, store.ErrNoteNotFound) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

// handleDeleteNotes and handleRestoreNotes serve the selection bar. They
// answer with a count rather than 204: after deleting a selection the screen
// says how many went, and that number has to come from the rows that actually
// changed.
func (s *Server) handleDeleteNotes(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	ids, ok := parseBulkIDs(w, r)
	if !ok {
		return
	}

	count, err := s.store.DeleteNotes(r.Context(), user.ID, ids)
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, bulkResponse{Count: count})
}

func (s *Server) handleRestoreNotes(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	ids, ok := parseBulkIDs(w, r)
	if !ok {
		return
	}

	count, err := s.store.RestoreNotes(r.Context(), user.ID, ids)
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, bulkResponse{Count: count})
}

func (s *Server) handleListNotes(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	limit := intParam(r, "limit", defaultLimit, 1, maxLimit)
	offset := intParam(r, "offset", 0, 0, 1<<30)

	domainIDs, ok := uuidListQuery(w, r, "domainId")
	if !ok {
		return
	}
	categoryIDs, ok := uuidListQuery(w, r, "categoryId")
	if !ok {
		return
	}

	rows, err := scoped(s, r, func(q *gen.Queries) ([]gen.ListNotesRow, error) {
		return q.ListNotes(r.Context(), gen.ListNotesParams{
			UserID: user.ID,
			Limit:  int32(limit),
			Offset: int32(offset),
			// The Terhapus view, off unless asked for: the same list, filtered to
			// what has been deleted, so restoring is a normal screen rather than a
			// toast the user has to catch.
			Deleted:     boolQuery(r, "deleted"),
			DomainIds:   domainIDs,
			CategoryIds: categoryIDs,
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	out := make([]noteSummary, 0, len(rows))
	for _, n := range rows {
		out = append(out, noteSummary{
			ID:          n.ID.String(),
			Title:       n.Title,
			DomainID:    uuidString(n.DomainID),
			CategoryIDs: uuidStrings(n.CategoryIds),
			UpdatedAt:   n.UpdatedAt,
		})
	}

	writeJSON(w, http.StatusOK, out)
}

// uuidListQuery reads a repeatable filter from the query string:
// `?domainId=a&domainId=b` means either. Absent means "no filter".
//
// The empty slice is returned rather than nil, and that is not a style choice.
// pgx encodes a nil Go slice as SQL NULL, `cardinality(NULL)` is NULL, and the
// "no filter" arm of the WHERE clause is written as a cardinality test — so a
// nil reaching the query would turn "filter by nothing" into "match nothing"
// and empty both index screens. The SQL comment says the same thing from the
// other side.
//
// Unparseable is a 400, because silently ignoring a malformed filter would
// show the user everything and look like the filter matched everything.
func uuidListQuery(w http.ResponseWriter, r *http.Request, name string) ([]uuid.UUID, bool) {
	raw := r.URL.Query()[name]
	out := make([]uuid.UUID, 0, len(raw))

	for _, v := range raw {
		// A repeated parameter with an empty value is how an unset <select>
		// serialises. It means "no filter", not "a filter that is broken".
		if v == "" {
			continue
		}
		id, err := uuid.Parse(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, CodeBadRequest, "Filter tidak valid.")
			return nil, false
		}
		out = append(out, id)
	}

	return out, true
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
	exists, err := scoped(s, r, func(q *gen.Queries) (bool, error) {
		return q.DomainExists(r.Context(), gen.DomainExistsParams{
			ID:     id,
			UserID: user.ID,
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return nil, false
	}
	if !exists {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Domain tidak dikenal.")
		return nil, false
	}
	return &id, true
}

// maxCategoriesPerItem bounds how many labels one note or card may carry. Not
// a product rule — a bound on an unbounded loop of inserts, since the request
// body decides how many run.
const maxCategoriesPerItem = 50

// parseCategories turns the wire's optional categoryIds into uuids and checks
// they are all this user's.
//
// Same division of labour as parseDomain: the composite foreign key is what
// actually enforces tenancy (D-047) and holds even if this is forgotten. This
// exists so an unknown or someone else's category is a 400 with Indonesian
// copy rather than a constraint violation surfacing as a 500. Unknown and
// not-yours are the same answer (D-039).
//
// Duplicates are dropped rather than rejected: sending the same label twice
// means the same thing as sending it once, and the join table would refuse the
// second insert anyway.
func (s *Server) parseCategories(w http.ResponseWriter, r *http.Request, raw *[]string) ([]uuid.UUID, bool) {
	if raw == nil || len(*raw) == 0 {
		return nil, true
	}
	if len(*raw) > maxCategoriesPerItem {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Terlalu banyak kategori.")
		return nil, false
	}

	user, _ := UserFrom(r.Context())

	seen := make(map[uuid.UUID]bool, len(*raw))
	out := make([]uuid.UUID, 0, len(*raw))
	for _, s2 := range *raw {
		id, err := uuid.Parse(s2)
		if err != nil {
			writeError(w, http.StatusBadRequest, CodeBadRequest, "Kategori tidak dikenal.")
			return nil, false
		}
		if seen[id] {
			continue
		}
		seen[id] = true

		if _, err := scoped(s, r, func(q *gen.Queries) (gen.Category, error) {
			return q.GetCategory(r.Context(), gen.GetCategoryParams{
				ID: id, UserID: user.ID,
			})
		}); errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusBadRequest, CodeBadRequest, "Kategori tidak dikenal.")
			return nil, false
		} else if err != nil {
			writeInternal(w, r, err)
			return nil, false
		}
		out = append(out, id)
	}
	return out, true
}

// deriveTitle takes the first line that carries text.
func deriveTitle(md string) string {
	const fallback = "Tanpa judul"

	for _, line := range strings.Split(md, "\n") {
		line = strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "#>-* "))
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
