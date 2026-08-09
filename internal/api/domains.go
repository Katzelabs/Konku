package api

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Domains belong to a user (D-046). Every query is scoped by user_id, and the
// composite foreign keys on notes, focus_sessions and exams make a
// cross-tenant reference impossible even if a handler forgets to check
// (D-047).
//
// The list is the live set only. A note or session tagged with an archived
// domain still needs its label, which is what the `includeArchived` query
// parameter is for.

type domainResponse struct {
	ID          string     `json:"id"`
	Slug        string     `json:"slug"`
	Label       string     `json:"label"`
	Color       string     `json:"color"`
	WeeklyQuota int32      `json:"weeklyQuota"`
	SortOrder   int32      `json:"sortOrder"`
	ArchivedAt  *time.Time `json:"archivedAt"`
}

func toDomainResponse(d gen.Domain) domainResponse {
	return domainResponse{
		ID:          d.ID.String(),
		Slug:        d.Slug,
		Label:       d.Label,
		Color:       d.Color,
		WeeklyQuota: d.WeeklyQuota,
		SortOrder:   d.SortOrder,
		ArchivedAt:  d.ArchivedAt,
	}
}

func (s *Server) handleListDomains(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	var (
		domains []gen.Domain
		err     error
	)
	if r.URL.Query().Get("includeArchived") == "true" {
		domains, err = scoped(s, r, func(q *gen.Queries) ([]gen.Domain, error) {
			return q.ListAllDomains(r.Context(), user.ID)
		})
	} else {
		domains, err = scoped(s, r, func(q *gen.Queries) ([]gen.Domain, error) {
			return q.ListDomains(r.Context(), user.ID)
		})
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	out := make([]domainResponse, 0, len(domains))
	for _, d := range domains {
		out = append(out, toDomainResponse(d))
	}

	writeJSON(w, http.StatusOK, out)
}

const (
	maxDomainLabelLen = 60
	// Three sessions a day is already far past what GOALS.md describes as
	// realistic. The bound exists to catch a typo, not to police the user.
	maxWeeklyQuota = 21
)

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type domainRequest struct {
	Label       *string `json:"label"`
	Color       *string `json:"color"`
	WeeklyQuota *int32  `json:"weeklyQuota"`
	SortOrder   *int32  `json:"sortOrder"`
}

func (s *Server) handleCreateDomain(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	var req domainRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	label := strings.TrimSpace(deref(req.Label))
	color := strings.TrimSpace(deref(req.Color))
	quota := derefInt(req.WeeklyQuota)
	if !validDomainFields(w, label, color, quota) {
		return
	}

	d, err := scoped(s, r, func(q *gen.Queries) (gen.Domain, error) {
		return q.CreateDomain(r.Context(), gen.CreateDomainParams{
			UserID:      user.ID,
			Slug:        slugify(label),
			Label:       label,
			Color:       color,
			WeeklyQuota: quota,
			SortOrder:   derefInt(req.SortOrder),
		})
	})
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, CodeConflict, "Sudah ada domain dengan nama itu.")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusCreated, toDomainResponse(d))
}

// handleUpdateDomain is a PATCH: fields the client left out keep their stored
// value. slug is not updatable — it is the seed identity, and renaming is what
// label is for.
func (s *Server) handleUpdateDomain(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := domainIDParam(w, r)
	if !ok {
		return
	}

	var req domainRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	current, err := scoped(s, r, func(q *gen.Queries) (gen.Domain, error) {
		return q.GetDomain(r.Context(), gen.GetDomainParams{ID: id, UserID: user.ID})
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
	quota, order := current.WeeklyQuota, current.SortOrder
	if req.Label != nil {
		label = strings.TrimSpace(*req.Label)
	}
	if req.Color != nil {
		color = strings.TrimSpace(*req.Color)
	}
	if req.WeeklyQuota != nil {
		quota = *req.WeeklyQuota
	}
	if req.SortOrder != nil {
		order = *req.SortOrder
	}
	if !validDomainFields(w, label, color, quota) {
		return
	}

	d, err := scoped(s, r, func(q *gen.Queries) (gen.Domain, error) {
		return q.UpdateDomain(r.Context(), gen.UpdateDomainParams{
			ID:          id,
			UserID:      user.ID,
			Label:       label,
			Color:       color,
			WeeklyQuota: quota,
			SortOrder:   order,
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

	writeJSON(w, http.StatusOK, toDomainResponse(d))
}

// handleArchiveDomain is the normal way to retire a domain (D-051). Notes and
// focus sessions keep their tag; the domain just leaves the pickers.
func (s *Server) handleArchiveDomain(w http.ResponseWriter, r *http.Request) {
	s.setDomainArchived(w, r, true)
}

func (s *Server) handleUnarchiveDomain(w http.ResponseWriter, r *http.Request) {
	s.setDomainArchived(w, r, false)
}

func (s *Server) setDomainArchived(w http.ResponseWriter, r *http.Request, archive bool) {
	user, _ := UserFrom(r.Context())

	id, ok := domainIDParam(w, r)
	if !ok {
		return
	}

	var (
		d   gen.Domain
		err error
	)
	if archive {
		d, err = scoped(s, r, func(q *gen.Queries) (gen.Domain, error) {
			return q.ArchiveDomain(r.Context(), gen.ArchiveDomainParams{ID: id, UserID: user.ID})
		})
	} else {
		d, err = scoped(s, r, func(q *gen.Queries) (gen.Domain, error) {
			return q.UnarchiveDomain(r.Context(), gen.UnarchiveDomainParams{ID: id, UserID: user.ID})
		})
	}
	// ArchiveDomain also matches nothing when the domain is already archived,
	// which is indistinguishable here from not existing. Both are 404, and
	// archiving twice is not an error worth a distinct code.
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, toDomainResponse(d))
}

// handleDeleteDomain removes a domain outright, which only works when nothing
// references it. Every foreign key pointing at domains is ON DELETE NO ACTION
// (D-051), so a domain with notes or sessions raises foreign_key_violation —
// mapped here to 409 with a message that points at archiving instead.
func (s *Server) handleDeleteDomain(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())

	id, ok := domainIDParam(w, r)
	if !ok {
		return
	}

	rows, err := scoped(s, r, func(q *gen.Queries) (int64, error) {
		return q.DeleteDomain(r.Context(), gen.DeleteDomainParams{ID: id, UserID: user.ID})
	})
	if isForeignKeyViolation(err) {
		writeError(w, http.StatusConflict, CodeConflict,
			"Domain ini masih dipakai catatan atau sesi. Arsipkan saja.")
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

func validDomainFields(w http.ResponseWriter, label, color string, quota int32) bool {
	if label == "" {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Nama domain tidak boleh kosong.")
		return false
	}
	if utf8.RuneCountInString(label) > maxDomainLabelLen {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Nama domain terlalu panjang.")
		return false
	}
	if !hexColor.MatchString(color) {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Warna harus dalam format #RRGGBB.")
		return false
	}
	if quota < 0 || quota > maxWeeklyQuota {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Target mingguan tidak masuk akal.")
		return false
	}
	return true
}

// slugify derives the stable slug from the label. It is only a seed: the slug
// never changes afterwards, so a later rename does not invalidate anything
// that referenced it.
func slugify(label string) string {
	var b strings.Builder
	lastDash := true // leading dashes are dropped
	for _, r := range strings.ToLower(label) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case !lastDash:
			b.WriteByte('-')
			lastDash = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		// A label of pure punctuation or non-Latin script still needs a slug,
		// and uniqueness is what actually matters.
		return "domain-" + uuid.NewString()[:8]
	}
	return slug
}

func domainIDParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeNotFound(w)
		return uuid.UUID{}, false
	}
	return id, true
}

func derefInt(v *int32) int32 {
	if v == nil {
		return 0
	}
	return *v
}

// Postgres error codes, so a constraint the schema already enforces becomes a
// precise status instead of a 500. See D-047 and D-051.
func isUniqueViolation(err error) bool     { return pgErrCode(err) == "23505" }
func isForeignKeyViolation(err error) bool { return pgErrCode(err) == "23503" }

func pgErrCode(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}
