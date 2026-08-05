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
}

type errorResponse struct {
	Error errorBody `json:"error"`
}

const (
	CodeBadRequest   = "bad_request"
	CodeUnauthorized = "unauthorized"
	CodeNotFound     = "not_found"
	CodeRateLimited  = "rate_limited"
	CodeInternal     = "internal"
)

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

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorResponse{Error: errorBody{Code: code, Message: message}})
}

// writeInternal logs the real cause and returns a generic message. Internal
// errors must never leak driver or query detail to the client.
func writeInternal(w http.ResponseWriter, err error) {
	slog.Error("request failed", "error", err)
	writeError(w, http.StatusInternalServerError, CodeInternal,
		"Terjadi kesalahan di server. Coba lagi sebentar lagi.")
}

// writeNotFound is also the correct response for a resource owned by another
// user. Scoping happens in the WHERE clause, so "not yours" and "not there"
// are indistinguishable and the API cannot be used to probe for other users'
// data (D-039).
func writeNotFound(w http.ResponseWriter) {
	writeError(w, http.StatusNotFound, CodeNotFound, "Tidak ditemukan.")
}
