package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// One error shape from every endpoint, so the React client has a single error
// path instead of per-endpoint special cases (D-040).
//
// Code is stable and machine-readable — the client branches on it.
// Message is user-facing and therefore in Bahasa Indonesia.
type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	// RequestID ties a screenshot to a log query (D-062). Omitted rather than
	// sent empty, so a response from outside the middleware chain does not
	// carry a field that looks like a lost ID.
	RequestID string `json:"request_id,omitempty"`
}

type errorResponse struct {
	Error errorBody `json:"error"`
}

const (
	CodeBadRequest   = "bad_request"
	CodeUnauthorized = "unauthorized"
	CodeNotFound     = "not_found"
	CodeConflict     = "conflict"
	CodeRateLimited  = "rate_limited"
	CodeInternal     = "internal"

	// The client branches on these two rather than on a message.
	//
	// CodeEmailUnverified is what turns a 403 into a "check your mail" screen
	// with a working resend button, instead of a dead end that looks like a
	// permissions bug. CodeInvalidToken covers unknown, spent and expired
	// links, which are deliberately indistinguishable (07 L3, L4).
	CodeEmailUnverified = "email_unverified"
	CodeInvalidToken    = "invalid_token"
)

// maxRequestBody bounds every JSON body. A note is markdown typed by a human;
// a megabyte is already far past anything real, and the parser should never be
// handed an unbounded document.
const maxRequestBody = 1 << 20

// decodeJSON reads a request body and writes the 400 itself, so handlers read
// as a straight line. It reports whether decoding succeeded.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBody)).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, CodeBadRequest, "Permintaan tidak valid.")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("writing json response", "error", err)
	}
}

// requestIDOf reads the ID the logging middleware published on the response.
//
// Going through the header rather than the request is what keeps this change
// to two functions: writeError has around a hundred call sites, and threading
// an *http.Request through every one of them to carry a string would be a far
// larger diff than the feature deserves.
func requestIDOf(w http.ResponseWriter) string {
	return w.Header().Get(requestIDHeader)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorResponse{Error: errorBody{
		Code:      code,
		Message:   message,
		RequestID: requestIDOf(w),
	}})
}

// writeInternal logs the real cause and returns a generic message. Internal
// errors must never leak driver or query detail to the client.
//
// The log line and the response now share a request ID, which is the entire
// point: the user can read theirs off the screen and it finds this line.
func writeInternal(w http.ResponseWriter, r *http.Request, err error) {
	id := requestIDOf(w)
	slog.Error("request failed", "request_id", id, "error", err)

	// The same failure reaches Sentry with the same request id, so a log
	// line, an event and the user's screenshot all name each other (D-062).
	reportError(r, err, id)

	msg := "Terjadi kesalahan di server. Coba lagi sebentar lagi."
	if id != "" {
		// Shown so a screenshot is actionable. It is a random opaque token —
		// it identifies the request, not the person (rule 10).
		msg += " Kode: " + id
	}
	writeError(w, http.StatusInternalServerError, CodeInternal, msg)
}

// writeNotFound is also the correct response for a resource owned by another
// user. Scoping happens in the WHERE clause, so "not yours" and "not there"
// are indistinguishable and the API cannot be used to probe for other users'
// data (D-039).
func writeNotFound(w http.ResponseWriter) {
	writeError(w, http.StatusNotFound, CodeNotFound, "Tidak ditemukan.")
}
