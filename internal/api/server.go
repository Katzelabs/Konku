// Package api wires HTTP routes to handlers.
//
// Handlers are plain http.HandlerFunc — chi is a router, not a framework, so
// nothing here depends on a custom context type (D-042).
package api

import (
	"io/fs"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/zidanhafiz/konku/internal/config"
)

// Server holds the dependencies handlers need. Dependency injection is a
// struct with fields and a constructor — no framework (D-045).
type Server struct {
	cfg  config.Config
	dist fs.FS
	// store *store.Store  — added with the first real endpoint
	// auth  *auth.Service — added with the auth task
}

func NewServer(cfg config.Config, dist fs.FS) *Server {
	return &Server{cfg: cfg, dist: dist}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP) // trustworthy because Caddy sits in front
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", s.handleHealth)

		// Unauthenticated. Rate-limited because it is the only unauthenticated
		// write path in the application (D-039).
		// r.With(rateLimit).Post("/auth/login", s.handleLogin)

		// Everything else requires a user. Keeping authenticated routes inside
		// an explicit group is why chi was chosen over stdlib: "all of /api
		// except login" is a security boundary, not a style preference.
		r.Group(func(r chi.Router) {
			// r.Use(s.requireUser)
			//
			// r.Route("/notes", func(r chi.Router) {
			// 	r.Post("/", s.handleCreateNote)
			// 	r.Get("/{id}", s.handleGetNote)
			// 	r.Patch("/{id}", s.handleUpdateNote) // triggers card sync
			// })
			// r.Get("/review/due", s.handleDueCards)
			// r.Post("/review/{cardID}", s.handleRateCard)
			// r.Post("/sessions", s.handleLogSession)
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

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
