package api

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/Katzelabs/Konku/internal/export"
)

// handleExport streams the account's whole archive (07 L6).
//
// Everything is read before the first byte is written. A streaming export has
// already sent 200 and half a file by the time a query fails, so the user gets
// a truncated archive that looks complete — which is precisely the silent loss
// this product exists to prevent. Reading first means a failure is a normal
// error response with the standard shape.
func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, "Kamu belum masuk.")
		return
	}

	archive, err := export.Load(r.Context(), s.store, user.ID)
	if err != nil {
		if errors.Is(err, export.ErrTooLarge) {
			// Not an internal error and not something retrying fixes, so it
			// gets its own answer. The message says what to do rather than
			// only that something is wrong — a dead end here is worse than
			// elsewhere, because the person may be trying to leave.
			writeError(w, http.StatusRequestEntityTooLarge, CodeBadRequest,
				"Arsip kamu terlalu besar untuk dibuat sekaligus. "+
					"Hubungi pengelola supaya ekspornya bisa dibagi.")
			return
		}
		writeInternal(w, r, err)
		return
	}

	filename := export.Filename(time.Now())
	w.Header().Set("Content-Type", "application/zip")
	// Quoted, because the name is generated but the header is a place where an
	// unquoted value with a space silently truncates.
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	// The archive is built per request from live data; a cached copy would be
	// a stale answer to "what do I have right now".
	w.Header().Set("Cache-Control", "no-store")

	if err := archive.Write(w); err != nil {
		// The response is already committed, so there is no error shape left
		// to send — and writeInternal would send one anyway, appending JSON to
		// a truncated zip and logging a superfluous-WriteHeader warning on the
		// way out. Report it instead: a truncated download with a log line and
		// a Sentry event is recoverable, a truncated download with silence is
		// not.
		requestID := middleware.GetReqID(r.Context())
		slog.Error("could not write the export archive",
			"request_id", requestID, "user_id", user.ID.String(), "error", err)
		reportError(r, err, requestID)
		return
	}
}
