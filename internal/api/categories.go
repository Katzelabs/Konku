package api

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Categories label notes and cards with one shared vocabulary (D-055).
//
// They are not domains. A domain is one per item, drives the weekly rota and
// exam draws, and carries a colour; a category is many per item, means nothing
// to the scheduler, and exists to organise.

const maxCategoryLabelLen = 60

type categoryRequest struct {
	Label *string `json:"label"`
}

type categoryResponse struct {
	ID    string `json:"id"`
	Slug  string `json:"slug"`
	Label string `json:"label"`
	// Archived categories stay attached to everything they ever labelled; they
	// only leave the picker (D-051).
	ArchivedAt *time.Time `json:"archivedAt"`
	NoteCount  int64      `json:"noteCount"`
	CardCount  int64      `json:"cardCount"`
}

func toCategoryResponse(c gen.Category, notes, cards int64) categoryResponse {
	return categoryResponse{
		ID:         c.ID.String(),
		Slug:       c.Slug,
		Label:      c.Label,
		ArchivedAt: c.ArchivedAt,
		NoteCount:  notes,
		CardCount:  cards,
	}
}

func (s *Server) handleListCategories(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	rows, err := s.store.Q().ListCategories(r.Context(), gen.ListCategoriesParams{
		UserID:          user.ID,
		IncludeArchived: r.URL.Query().Get("includeArchived") == "true",
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	out := make([]categoryResponse, 0, len(rows))
	for _, c := range rows {
		out = append(out, categoryResponse{
			ID:         c.ID.String(),
			Slug:       c.Slug,
			Label:      c.Label,
			ArchivedAt: c.ArchivedAt,
			NoteCount:  c.NoteCount,
			CardCount:  c.CardCount,
		})
	}

	writeJSON(w, http.StatusOK, out)
}

// handleCreateCategory is create-on-type, so it is deliberately idempotent:
// a label whose slug already exists returns that category with 200 instead of
// a 409.
//
// The picker calls this the moment a user types a label that does not exist
// yet. Making them resolve a conflict there would put a dialog in front of
// capture, and capture cost is the thing to protect (hard rule 7).
func (s *Server) handleCreateCategory(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	var req categoryRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	label := strings.TrimSpace(deref(req.Label))
	slug := categorySlug(label)
	if !validCategory(w, label, slug) {
		return
	}

	existing, err := s.store.Q().GetCategoryBySlug(r.Context(), gen.GetCategoryBySlugParams{
		Slug: slug, UserID: user.ID,
	})
	if err == nil {
		writeJSON(w, http.StatusOK, toCategoryResponse(existing, 0, 0))
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeInternal(w, err)
		return
	}

	created, err := s.store.Q().CreateCategory(r.Context(), gen.CreateCategoryParams{
		UserID: user.ID,
		Slug:   slug,
		Label:  label,
	})
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, toCategoryResponse(created, 0, 0))
}

func (s *Server) handleUpdateCategory(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := idParam(w, r)
	if !ok {
		return
	}

	var req categoryRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	label := strings.TrimSpace(deref(req.Label))
	slug := categorySlug(label)
	if !validCategory(w, label, slug) {
		return
	}

	// Renaming onto a slug another category already holds is the one genuine
	// conflict here — unlike create, there is no sensible "you meant that one"
	// answer, because this category already has its own labelled rows.
	if existing, err := s.store.Q().GetCategoryBySlug(r.Context(), gen.GetCategoryBySlugParams{
		Slug: slug, UserID: user.ID,
	}); err == nil && existing.ID != id {
		writeError(w, http.StatusConflict, CodeConflict, "Sudah ada kategori dengan nama itu.")
		return
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeInternal(w, err)
		return
	}

	updated, err := s.store.Q().UpdateCategory(r.Context(), gen.UpdateCategoryParams{
		ID: id, UserID: user.ID, Slug: slug, Label: label,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusOK, toCategoryResponse(updated, 0, 0))
}

func (s *Server) handleArchiveCategory(w http.ResponseWriter, r *http.Request) {
	s.setCategoryArchived(w, r, true)
}

func (s *Server) handleUnarchiveCategory(w http.ResponseWriter, r *http.Request) {
	s.setCategoryArchived(w, r, false)
}

func (s *Server) setCategoryArchived(w http.ResponseWriter, r *http.Request, archived bool) {
	user, _ := UserFrom(r.Context())

	id, ok := idParam(w, r)
	if !ok {
		return
	}

	var (
		c   gen.Category
		err error
	)
	if archived {
		c, err = s.store.Q().ArchiveCategory(r.Context(), gen.ArchiveCategoryParams{ID: id, UserID: user.ID})
	} else {
		c, err = s.store.Q().UnarchiveCategory(r.Context(), gen.UnarchiveCategoryParams{ID: id, UserID: user.ID})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}

	writeJSON(w, http.StatusOK, toCategoryResponse(c, 0, 0))
}

// handleDeleteCategory only succeeds for a category nothing references.
//
// Both join tables are ON DELETE NO ACTION, so one still in use raises
// foreign_key_violation and that becomes a 409 — never a 500, and never a
// silent unlabelling of a hundred cards (D-051).
func (s *Server) handleDeleteCategory(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := idParam(w, r)
	if !ok {
		return
	}

	rows, err := s.store.Q().DeleteCategory(r.Context(), gen.DeleteCategoryParams{ID: id, UserID: user.ID})
	if isForeignKeyViolation(err) {
		writeError(w, http.StatusConflict, CodeConflict,
			"Kategori ini masih dipakai. Arsipkan saja kalau sudah tidak perlu.")
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

func validCategory(w http.ResponseWriter, label, slug string) bool {
	if label == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Nama kategori tidak boleh kosong.")
		return false
	}
	if utf8.RuneCountInString(label) > maxCategoryLabelLen {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Nama kategori terlalu panjang.")
		return false
	}
	// A label of nothing but punctuation slugifies to the empty string, which
	// would collide with every other such label under the unique index.
	if slug == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Nama kategori tidak valid.")
		return false
	}
	return true
}

// categorySlug derives the stable key from the label.
//
// Deliberately not domains' slugify, which it otherwise resembles. Two
// differences carry weight here: '/' survives, because it is what makes
// 'math/aljabar' available as nesting later without a migration; and any
// letter counts, not just a-z, so a non-Latin label keeps its own characters
// instead of collapsing to an opaque generated slug.
func categorySlug(label string) string {
	var b strings.Builder
	lastDash := true // leading dashes are dropped

	for _, r := range strings.ToLower(label) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r) || r == '/':
			b.WriteRune(r)
			lastDash = false
		case !lastDash:
			b.WriteRune('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}
