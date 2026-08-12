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

// The colour a category gets when nobody picked one.
//
// It matches 00011's column default rather than being derived from it, because
// create-on-type never reaches the default: the INSERT names every column. The
// two have to agree, and the migration says why this particular grey.
const defaultCategoryColor = "#5C6B73"

type categoryRequest struct {
	Label *string `json:"label"`
	Color *string `json:"color"`
}

type categoryResponse struct {
	ID    string `json:"id"`
	Slug  string `json:"slug"`
	Label string `json:"label"`
	// #RRGGBB, chosen by the user in Pengaturan (00011). Like a domain's, this
	// is user data rather than a design token — it reaches the browser as an
	// inline style, which is why it is validated here and constrained in the
	// schema rather than trusted.
	Color string `json:"color"`
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
		Color:      c.Color,
		ArchivedAt: c.ArchivedAt,
		NoteCount:  notes,
		CardCount:  cards,
	}
}

func (s *Server) handleListCategories(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	rows, err := scoped(s, r, func(q *gen.Queries) ([]gen.ListCategoriesRow, error) {
		return q.ListCategories(r.Context(), gen.ListCategoriesParams{
			UserID:          user.ID,
			IncludeArchived: r.URL.Query().Get("includeArchived") == "true",
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	out := make([]categoryResponse, 0, len(rows))
	for _, c := range rows {
		out = append(out, categoryResponse{
			ID:         c.ID.String(),
			Slug:       c.Slug,
			Label:      c.Label,
			Color:      c.Color,
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

	// Colour is optional here on purpose. The picker inside the note and card
	// editors posts a label and nothing else — asking someone mid-sentence to
	// choose a colour before their label exists is exactly the friction hard
	// rule 7 forbids. Colours are chosen later, in Pengaturan, or never.
	color := defaultCategoryColor
	if req.Color != nil {
		color = strings.TrimSpace(*req.Color)
		if !validColor(w, color) {
			return
		}
	}

	existing, err := scoped(s, r, func(q *gen.Queries) (gen.Category, error) {
		return q.GetCategoryBySlug(r.Context(), gen.GetCategoryBySlugParams{
			Slug: slug, UserID: user.ID,
		})
	})
	if err == nil {
		// Idempotent, and that extends to the colour: a label that already
		// exists comes back as it is rather than being recoloured by whoever
		// typed it next. Overwriting here would let the editor's picker quietly
		// undo a choice made in Pengaturan.
		writeJSON(w, http.StatusOK, toCategoryResponse(existing, 0, 0))
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeInternal(w, r, err)
		return
	}

	created, err := scoped(s, r, func(q *gen.Queries) (gen.Category, error) {
		return q.CreateCategory(r.Context(), gen.CreateCategoryParams{
			UserID: user.ID,
			Slug:   slug,
			Label:  label,
			Color:  color,
		})
	})
	if err != nil {
		writeInternal(w, r, err)
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

	// A PATCH, like handleUpdateDomain: fields the client left out keep their
	// stored value. Recolouring from Pengaturan sends a colour and no label,
	// and a handler that read a missing label as the empty string would answer
	// "Nama kategori tidak boleh kosong" to a request that never mentioned it.
	current, err := scoped(s, r, func(q *gen.Queries) (gen.Category, error) {
		return q.GetCategory(r.Context(), gen.GetCategoryParams{ID: id, UserID: user.ID})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	label, color := current.Label, current.Color
	if req.Label != nil {
		label = strings.TrimSpace(*req.Label)
	}
	if req.Color != nil {
		color = strings.TrimSpace(*req.Color)
	}

	// The slug is re-derived from the label rather than kept, because a
	// category's slug is its identity to the user — unlike a domain's, which is
	// a seed and frozen. Renaming one is meant to move it.
	slug := categorySlug(label)
	if !validCategory(w, label, slug) {
		return
	}
	if !validColor(w, color) {
		return
	}

	// Renaming onto a slug another category already holds is the one genuine
	// conflict here — unlike create, there is no sensible "you meant that one"
	// answer, because this category already has its own labelled rows.
	if existing, err := scoped(s, r, func(q *gen.Queries) (gen.Category, error) {
		return q.GetCategoryBySlug(r.Context(), gen.GetCategoryBySlugParams{
			Slug: slug, UserID: user.ID,
		})
	}); err == nil && existing.ID != id {
		writeError(w, http.StatusConflict, CodeConflict, "Sudah ada kategori dengan nama itu.")
		return
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeInternal(w, r, err)
		return
	}

	updated, err := scoped(s, r, func(q *gen.Queries) (gen.Category, error) {
		return q.UpdateCategory(r.Context(), gen.UpdateCategoryParams{
			ID: id, UserID: user.ID, Slug: slug, Label: label, Color: color,
		})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
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
		c, err = scoped(s, r, func(q *gen.Queries) (gen.Category, error) {
			return q.ArchiveCategory(r.Context(), gen.ArchiveCategoryParams{ID: id, UserID: user.ID})
		})
	} else {
		c, err = scoped(s, r, func(q *gen.Queries) (gen.Category, error) {
			return q.UnarchiveCategory(r.Context(), gen.UnarchiveCategoryParams{ID: id, UserID: user.ID})
		})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
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

	rows, err := scoped(s, r, func(q *gen.Queries) (int64, error) {
		return q.DeleteCategory(r.Context(), gen.DeleteCategoryParams{ID: id, UserID: user.ID})
	})
	if isForeignKeyViolation(err) {
		writeError(w, http.StatusConflict, CodeConflict,
			"Kategori ini masih dipakai. Arsipkan saja kalau sudah tidak perlu.")
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

// validColor is the handler half of hard rule 9 for a category's colour; the
// other half is the CHECK constraint in 00011. It reuses domains' hexColor
// pattern because the two are the same value going to the same place — an
// inline `style` on a coloured dot.
func validColor(w http.ResponseWriter, color string) bool {
	if !hexColor.MatchString(color) {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Warna harus dalam format #RRGGBB.")
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
