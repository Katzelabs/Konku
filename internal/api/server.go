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

			// r.Route("/notes", ...)          — A1
			// r.Get("/review/due", ...)       — A2
			// r.Post("/review/{cardID}", ...) — A2
			// r.Post("/sessions", ...)        — A3
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
