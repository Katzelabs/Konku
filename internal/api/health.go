package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

// Liveness and readiness are separate because the correct response to each is
// the opposite of the other (D-062).
//
// The old /api/health pinged the database and returned 503 when it was
// unreachable. Anything watching that endpoint as a liveness probe restarts
// the container during a database blip — which cannot possibly help, and
// throws away the warm pool and every in-flight request on the way out.
//
//   - /healthz  the process is alive and serving. Restart me if this fails.
//   - /readyz   this instance can serve real traffic. Take me out of rotation
//     if this fails, but do NOT restart me.
//
// Both are outside /api: they are operational endpoints, not part of the
// product's API surface, and nothing in the SPA calls them.

// handleLive answers as long as the process can accept a connection and run a
// handler. It deliberately touches nothing else — a liveness check with a
// dependency in it is a liveness check that can lie.
func (s *Server) handleLive(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReady reports whether this instance should receive traffic.
//
// Two conditions, because "the database answers" is not the same as "the
// schema is the one this binary was built for":
//
//  1. the database is reachable
//  2. the live schema version still matches the one this process migrated to
//
// The second catches the case that is otherwise completely silent: another
// instance, or a rollback, moving the schema underneath a running container.
// The binary then serves queries written for a schema that is no longer there,
// and every symptom looks like an application bug.
func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if err := s.store.Ping(ctx); err != nil {
		slog.Error("readiness: database unreachable",
			"request_id", requestIDOf(w), "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "unready",
			"reason": "database_unreachable",
		})
		return
	}

	want := s.store.ExpectedSchemaVersion()
	got, err := s.store.SchemaVersion(ctx)
	if err != nil {
		slog.Error("readiness: cannot read schema version",
			"request_id", requestIDOf(w), "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "unready",
			"reason": "schema_unreadable",
		})
		return
	}
	if want != 0 && got != want {
		// Loud on purpose. This is the line that explains an outage nobody
		// else can explain.
		slog.Error("readiness: schema moved underneath this process",
			"request_id", requestIDOf(w), "expected", want, "actual", got)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "unready",
			"reason": "schema_mismatch",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":         "ok",
		"schema_version": got,
	})
}
