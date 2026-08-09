package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// requestIDHeader carries chi's request ID out to the client.
//
// This is what makes a screenshot debuggable: the same value appears in the
// response header, in the error body, and in every log line for the request,
// so a user reporting "it broke" hands over one string that maps to a log
// query (D-062).
const requestIDHeader = "X-Request-Id"

// reqInfo is the mutable slot the logging middleware puts in the context so
// that middleware *below* it can report facts back up.
//
// requireUser runs inside the handler chain and creates its own derived
// context, which the outer middleware never sees. Without a shared pointer,
// the log line for an authenticated request could not carry its user_id —
// the one field that makes the logs useful without carrying any PII (rule 10).
type reqInfo struct {
	userID string
}

type reqInfoKey struct{}

func reqInfoFrom(ctx context.Context) *reqInfo {
	info, _ := ctx.Value(reqInfoKey{}).(*reqInfo)
	return info
}

// routePattern is the chi route the request matched, e.g. "/api/notes/{id}".
//
// Always this, never r.URL.Path: the raw path carries resource uuids, and as a
// metric label it would mint a time series per row. Only known once chi has
// matched, so callers read it after the handler returns.
func routePattern(r *http.Request) string {
	if rc := chi.RouteContext(r.Context()); rc != nil {
		if p := rc.RoutePattern(); p != "" {
			return p
		}
	}
	return "unmatched"
}

// requestLogger logs one line per request and publishes the request ID.
//
// What is deliberately absent: the body, any header, the query string, and the
// raw path. The raw path carries resource UUIDs and the query string is
// user-supplied; the routed pattern plus a user_id answers every operational
// question either would, which is the whole argument of hard rule 10 —
// "a user_id and a request ID are enough to debug and not enough to leak".
func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := middleware.GetReqID(r.Context())
		if id != "" {
			// Set before the handler runs, so writeError can read it back off
			// the header rather than every write helper growing an *http.Request
			// parameter across a hundred call sites.
			w.Header().Set(requestIDHeader, id)
		}

		info := &reqInfo{}
		r = r.WithContext(context.WithValue(r.Context(), reqInfoKey{}, info))

		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()

		defer func() {
			status := ww.Status()
			route := routePattern(r)
			attrs := []any{
				"request_id", id,
				"method", r.Method,
				"route", route,
				"status", status,
				"duration_ms", time.Since(start).Milliseconds(),
				"bytes", ww.BytesWritten(),
			}
			if info.userID != "" {
				attrs = append(attrs, "user_id", info.userID)
			}

			// A 4xx is the client being told no, which is normal; a 5xx is
			// this service failing, which is not. Logging both at the same
			// level is how a real error hides in a wall of 404s.
			switch {
			case status >= 500:
				slog.Error("request", attrs...)
			case status >= 400:
				slog.Warn("request", attrs...)
			default:
				slog.Info("request", attrs...)
			}
		}()

		next.ServeHTTP(ww, r)
	})
}
