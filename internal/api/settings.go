package api

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/i18n"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Per-account preferences.
//
// migration 00007 created user_settings, signup inserts a row, and the exporter
// serialises it — and until now nothing read it. Schema and code carrying no
// behaviour is what later gets a half-finished endpoint bolted onto it, so this
// is that endpoint, written once and deliberately.
//
// **The theme is not here and should not be.** It stays in localStorage because
// it is a property of a screen on a device, not of an account: the same person
// on a phone at night and a laptop at noon wants different answers, and syncing
// it would make one of those wrong (see AppearanceSettings.tsx).
//
// Two of the three columns have no feature behind them yet, and that is stated
// rather than hidden. focus_step_n is D-037's N, still to be tuned against real
// per-account data. rota_enabled is the weekly rota, which is not built. Both
// round-trip correctly and neither has a control, because inventing a screen
// for a feature that does not exist would be worse than the unread column.

// The bounds, restated from the CHECK constraints in migration 00007. The
// database is what makes them true; these are what make the refusal legible.
const (
	minFocusStepN = 1
	maxFocusStepN = 20
)

type settingsBody struct {
	// DefaultDurationMinutes is what the timer opens on. Bounded by the same
	// constants a session is validated against (sessions.go), because a default
	// you cannot then start would be a trap.
	DefaultDurationMinutes int `json:"defaultDurationMinutes"`
	// FocusStepN is D-037's progressive focus. No UI yet.
	FocusStepN int `json:"focusStepN"`
	// RotaEnabled is the weekly domain rota. No UI yet, and opt-out rather than
	// opt-in when there is one: it is the feature that makes domains do
	// anything, and defaulting it off would make a new account look like the
	// rota does not exist.
	RotaEnabled bool `json:"rotaEnabled"`
	// Locale is the language this account reads in, or null when it has never
	// chosen one (00014, ticket 11 I2).
	//
	// A pointer, and null is a value somebody means: it is "follow the
	// browser", the middle step of D-094's resolution order. Collapsing it to
	// "id" would make the setting one-way — a person who picked English could
	// never get back to following their browser — and would pin every existing
	// account to Indonesian the first time they saved any other preference.
	Locale *string `json:"locale"`
}

// defaultSettings mirrors the column defaults in migration 00007.
//
// Duplicated deliberately, and the duplication is the point: this is the answer
// for an account whose row does not exist, and reading the defaults out of the
// database would require the row this is standing in for.
func defaultSettings() settingsBody {
	return settingsBody{
		DefaultDurationMinutes: 20,
		FocusStepN:             5,
		RotaEnabled:            true,
		// nil, matching the column default: an account with no settings row
		// has certainly not chosen a language.
		Locale: nil,
	}
}

// toSettingsBody assembles the screen's object out of the two rows that back
// it: user_settings for the preferences, and users for the language.
//
// The split is 00014's and its reasoning is there — the locale has to be
// readable from the query that establishes identity, and only the auth
// substrate is. It is a preference to the person using it, so it is one object
// here and one PATCH, and the endpoint keeps the two writes in one transaction
// (hard rule 3).
func toSettingsBody(s gen.UserSetting, locale *string) settingsBody {
	return settingsBody{
		DefaultDurationMinutes: int(s.DefaultDurationMinutes),
		FocusStepN:             int(s.FocusStepN),
		RotaEnabled:            s.RotaEnabled,
		Locale:                 locale,
	}
}

// handleGetSettings returns the account's preferences.
//
// A missing row answers with the defaults rather than 404. Every account
// created since 07 L1 has one and migration 00007 backfilled the rest, so this
// is a path that should not be reachable — but the failure it prevents is a
// preferences screen that will not load, and defaults are the honest answer to
// "what is in effect right now" either way. The same tolerance export.Load
// already shows.
func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, "Kamu belum masuk.")
		return
	}

	row, err := store.UserQuery(r.Context(), s.store, user.ID, func(q *gen.Queries) (gen.UserSetting, error) {
		return q.GetUserSettings(r.Context(), user.ID)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// The preferences row is missing; the language is not, because it
			// is a column on the users row that requireUser already read. An
			// account with no user_settings row still gets its own language
			// back rather than a null that would look like a cleared choice.
			body := defaultSettings()
			body.Locale = user.Locale
			writeJSON(w, http.StatusOK, body)
			return
		}
		writeInternal(w, r, err)
		return
	}

	// user.Locale rather than a second read: requireUser put the whole row in
	// the context, and re-reading it here could only produce a different
	// answer if something else wrote it mid-request.
	writeJSON(w, http.StatusOK, toSettingsBody(row, user.Locale))
}

// handleUpdateSettings replaces the account's preferences.
//
// PATCH by verb and PUT by behaviour: every field is required and the whole row
// is written. A partial update would need pointers on every field to tell
// "absent" from "zero", and rota_enabled=false is a value somebody means. The
// client holds the full object anyway, because it just rendered it.
func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, CodeUnauthorized, "Kamu belum masuk.")
		return
	}

	var req settingsBody
	if !decodeJSON(w, r, &req) {
		return
	}

	// Validated here as well as by the CHECK constraints, because a constraint
	// violation arrives as a 500 and a person needs a sentence they can act on.
	if req.DefaultDurationMinutes < minDurationMinutes || req.DefaultDurationMinutes > maxDurationMinutes {
		writeError(w, http.StatusBadRequest, CodeBadRequest, fmt.Sprintf(
			"Durasi default harus antara %d dan %d menit.",
			minDurationMinutes, maxDurationMinutes))
		return
	}
	if req.FocusStepN < minFocusStepN || req.FocusStepN > maxFocusStepN {
		writeError(w, http.StatusBadRequest, CodeBadRequest, fmt.Sprintf(
			"Progressive focus harus antara %d dan %d.", minFocusStepN, maxFocusStepN))
		return
	}
	// null is allowed and means "follow the browser". Anything else has to be
	// a locale this build has copy for. 00014's CHECK constraint says the same
	// thing and is what makes the claim true regardless of which caller wrote
	// the row (hard rule 9); this is the half that produces a sentence a
	// person can act on rather than a constraint violation arriving as a 500.
	if req.Locale != nil && !i18n.Valid(i18n.Locale(*req.Locale)) {
		writeError(w, http.StatusBadRequest, CodeBadRequest,
			"Bahasa itu belum tersedia. Pilih Bahasa Indonesia atau English.")
		return
	}

	// Two tables, one transaction (hard rule 3). The screen shows one object
	// and saves it with one tap; a save that wrote the language and then
	// failed on the timer default would leave the person looking at a form
	// that is half what they asked for and half what they did not.
	var row gen.UserSetting
	err := s.store.WithUserTx(r.Context(), user.ID, func(q *gen.Queries) error {
		var err error
		row, err = q.UpsertUserSettings(r.Context(), gen.UpsertUserSettingsParams{
			UserID:                 user.ID,
			DefaultDurationMinutes: int32(req.DefaultDurationMinutes),
			FocusStepN:             int32(req.FocusStepN),
			RotaEnabled:            req.RotaEnabled,
		})
		if err != nil {
			return err
		}
		return q.SetUserLocale(r.Context(), gen.SetUserLocaleParams{
			ID:     user.ID,
			Locale: req.Locale,
		})
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	// The stored row, not the request. They should be identical, and echoing
	// the request would hide it if they were not.
	//
	// The locale is the exception and it is the request's, because SetUserLocale
	// is an :exec — it returns nothing to echo. It is the value the CHECK
	// constraint just accepted, so a mismatch is not a state the transaction
	// could have committed in.
	writeJSON(w, http.StatusOK, toSettingsBody(row, req.Locale))
}
