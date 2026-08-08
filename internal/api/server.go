// Package api wires HTTP routes to handlers.
//
// Handlers are plain http.HandlerFunc — chi is a router, not a framework, so
// nothing here depends on a custom context type (D-042).
package api

import (
	"context"
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/store"
)

// Server holds the dependencies handlers need. Dependency injection is a
// struct with fields and a constructor — no framework (D-045).
type Server struct {
	cfg   config.Config
	store *store.Store
	auth  *auth.Service
	dist  fs.FS
}

func NewServer(cfg config.Config, st *store.Store, au *auth.Service, dist fs.FS) *Server {
	return &Server{cfg: cfg, store: st, auth: au, dist: dist}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP) // trustworthy because Caddy sits in front
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	loginLimit := newRateLimiter(10, 5*time.Minute)

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", s.handleHealth)

		// Unauthenticated. Rate-limited because it is the only unauthenticated
		// write path in the application (D-039).
		r.With(loginLimit.middleware).Post("/auth/login", s.handleLogin)
		r.Post("/auth/logout", s.handleLogout)

		// Everything else requires a user. Keeping authenticated routes inside
		// an explicit group is why chi was chosen over stdlib: "all of /api
		// except login" is a security boundary, not a style preference.
		r.Group(func(r chi.Router) {
			r.Use(s.requireUser)

			r.Get("/auth/me", s.handleMe)

			r.Route("/notes", func(r chi.Router) {
				r.Get("/", s.handleListNotes)
				r.Post("/", s.handleCreateNote)
				r.Get("/{id}", s.handleGetNote)
				r.Patch("/{id}", s.handleUpdateNote)
			})

			// Cards are their own resource with their own CRUD (D-055). This
			// list also serves the picker for a fixed exam's questions —
			// filters make one endpoint enough for both.
			r.Route("/cards", func(r chi.Router) {
				r.Get("/", s.handleListCards)
				r.Post("/", s.handleCreateCard)
				r.Get("/{id}", s.handleGetCard)
				r.Patch("/{id}", s.handleUpdateCard)
				r.Delete("/{id}", s.handleDeleteCard)
				r.Post("/{id}/restore", s.handleRestoreCard)
			})

			// One shared vocabulary across notes and cards. Deletion only
			// succeeds for a category nothing references; archiving is the
			// normal path (D-051).
			r.Route("/categories", func(r chi.Router) {
				r.Get("/", s.handleListCategories)
				r.Post("/", s.handleCreateCategory)
				r.Patch("/{id}", s.handleUpdateCategory)
				r.Delete("/{id}", s.handleDeleteCategory)
				r.Post("/{id}/archive", s.handleArchiveCategory)
				r.Post("/{id}/unarchive", s.handleUnarchiveCategory)
			})

			// A card is addressed by its own uuid. It used to take a note and
			// an ID together, because card IDs were unique only within the
			// note they were parsed out of (D-055).
			r.Route("/review", func(r chi.Router) {
				r.Get("/due", s.handleDueCards)
				r.Get("/{cardID}/answer", s.handleCardAnswer)
				r.Post("/{cardID}", s.handleRate)
			})

			r.Get("/sessions", s.handleListSessions)
			r.Post("/sessions", s.handleCreateSession)

			// Domains are per-user and editable (D-046). Deletion only
			// succeeds for a domain nothing references; archiving is the
			// normal path (D-051).
			// Exams are practice tests over existing cards (D-048). Attempts
			// hang off /attempts rather than nesting under the exam: an
			// attempt is addressed on its own once it has started.
			r.Route("/exams", func(r chi.Router) {
				r.Get("/", s.handleListExams)
				r.Post("/", s.handleCreateExam)
				r.Get("/{id}", s.handleGetExam)
				r.Patch("/{id}", s.handleUpdateExam)
				r.Delete("/{id}", s.handleDeleteExam)
				r.Post("/{id}/archive", s.handleArchiveExam)
				r.Put("/{id}/cards", s.handleSetExamCards)
				r.Post("/{id}/attempts", s.handleStartAttempt)
			})

			r.Route("/attempts/{attemptID}", func(r chi.Router) {
				r.Get("/", s.handleGetAttempt)
				r.Delete("/", s.handleDeleteAttempt)
				r.Post("/finish", s.handleFinishAttempt)
				r.Get("/{cardID}/answer", s.handleAttemptAnswer)
				r.Post("/{cardID}", s.handleAnswerQuestion)
			})

			r.Route("/domains", func(r chi.Router) {
				r.Get("/", s.handleListDomains)
				r.Post("/", s.handleCreateDomain)
				r.Patch("/{id}", s.handleUpdateDomain)
				r.Delete("/{id}", s.handleDeleteDomain)
				r.Post("/{id}/archive", s.handleArchiveDomain)
				r.Post("/{id}/unarchive", s.handleUnarchiveDomain)
			})
		})

		// Unknown /api paths must return JSON, never the HTML shell.
		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeNotFound(w)
		})
	})

	// Everything that is not /api is the single-page app.
	r.NotFound(spaHandler(s.dist))

	return r
}

// handleHealth pings the database rather than just returning ok. A health
// check that cannot fail tells you nothing.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if err := s.store.Ping(ctx); err != nil {
		slog.Error("health check failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "degraded",
			"db":     "unreachable",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "db": "ok"})
}
