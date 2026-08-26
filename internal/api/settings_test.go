package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// Per-account preferences (user_settings).
//
// The table existed from migration 00007 and nothing read it. These assert the
// behaviour that was missing, including the one that is not negotiable for a new
// resource: another account's settings are unreachable.

type settingsBody struct {
	DefaultDurationMinutes int  `json:"defaultDurationMinutes"`
	FocusStepN             int  `json:"focusStepN"`
	RotaEnabled            bool `json:"rotaEnabled"`
	// The language the account reads in, or nil for "never chosen" (00014).
	// A pointer here as on the wire, because nil is the value that keeps
	// Accept-Language in play (D-094) and "" would not be distinguishable
	// from it.
	Locale *string `json:"locale"`
}

// defaults is what a fresh account reads. Written once so a new column added
// to settingsBody cannot leave half the tests asserting an old shape.
func defaults() settingsBody {
	return settingsBody{DefaultDurationMinutes: 20, FocusStepN: 5, RotaEnabled: true}
}

func ptr[T any](v T) *T { return &v }

// localeOf renders the pointer for a failure message, since %v on one prints
// an address rather than the thing anybody wants to read.
func localeOf(s settingsBody) string {
	if s.Locale == nil {
		return "<none>"
	}
	return *s.Locale
}

func getSettings(t *testing.T, c *testClient) settingsBody {
	t.Helper()
	res := c.do(http.MethodGet, "/settings", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET /settings = %d, want 200", res.StatusCode)
	}
	var out settingsBody
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("decoding settings: %v", err)
	}
	return out
}

// Signup seeds a row, so a new account reads the schema's defaults rather than
// zeroes. A zero here would mean a timer that opens on 0 minutes.
func TestSettingsStartAtTheDefaults(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	got := getSettings(t, c)
	want := defaults()
	if got != want {
		t.Errorf("settings = %+v, want %+v", got, want)
	}
}

func TestSettingsRoundTrip(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	// rota_enabled deliberately set to false: it is the field a partial-update
	// implementation would silently drop, because false is indistinguishable
	// from absent without pointers.
	want := settingsBody{DefaultDurationMinutes: 45, FocusStepN: 8, RotaEnabled: false}

	res := c.do(http.MethodPatch, "/settings", want)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("PATCH /settings = %d, want 200", res.StatusCode)
	}
	var echoed settingsBody
	if err := json.NewDecoder(res.Body).Decode(&echoed); err != nil {
		t.Fatalf("decoding the response: %v", err)
	}
	if echoed != want {
		t.Errorf("PATCH returned %+v, want %+v", echoed, want)
	}

	// Read back, because the response could be an echo of the request rather
	// than of anything stored.
	if got := getSettings(t, c); got != want {
		t.Errorf("after a reload, settings = %+v, want %+v", got, want)
	}
}

func TestSettingsValidateBounds(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	for _, tc := range []struct {
		name string
		body settingsBody
	}{
		{"duration zero", settingsBody{DefaultDurationMinutes: 0, FocusStepN: 5, RotaEnabled: true}},
		{"duration negative", settingsBody{DefaultDurationMinutes: -5, FocusStepN: 5, RotaEnabled: true}},
		{"duration past the session cap", settingsBody{DefaultDurationMinutes: 481, FocusStepN: 5, RotaEnabled: true}},
		{"step zero", settingsBody{DefaultDurationMinutes: 20, FocusStepN: 0, RotaEnabled: true}},
		{"step too large", settingsBody{DefaultDurationMinutes: 20, FocusStepN: 21, RotaEnabled: true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := c.do(http.MethodPatch, "/settings", tc.body)
			defer res.Body.Close()
			// 400 and not 500: these are also CHECK constraints, and a
			// constraint violation reaching the client as an internal error is
			// a sentence nobody can act on.
			if res.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", res.StatusCode)
			}
		})
	}

	// And nothing was written by any of the refusals.
	want := defaults()
	if got := getSettings(t, c); got != want {
		t.Errorf("settings = %+v after refused writes, want the defaults %+v", got, want)
	}
}

// The tenancy test. Not addressed by an id — the caller *is* the key — so the
// failure this guards against is not a wrong uuid but a query that forgot whose
// row it was reading (hard rule 4, D-039).
func TestSettingsAreScopedToTheAccount(t *testing.T) {
	a := newApp(t)
	alice := a.newClient(t)
	bob := a.newClient(t)

	res := alice.do(http.MethodPatch, "/settings", settingsBody{
		DefaultDurationMinutes: 45, FocusStepN: 12, RotaEnabled: false,
	})
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("alice's PATCH = %d, want 200", res.StatusCode)
	}

	// Bob still sees his own, untouched.
	want := defaults()
	if got := getSettings(t, bob); got != want {
		t.Errorf("bob's settings = %+v after alice wrote hers, want %+v", got, want)
	}

	// And Bob writing his own does not disturb Alice's, which is the same bug
	// in the other direction — an upsert keyed on the wrong id would overwrite.
	out := bob.do(http.MethodPatch, "/settings", settingsBody{
		DefaultDurationMinutes: 15, FocusStepN: 3, RotaEnabled: true,
	})
	out.Body.Close()

	alicesWant := settingsBody{DefaultDurationMinutes: 45, FocusStepN: 12, RotaEnabled: false}
	if got := getSettings(t, alice); got != alicesWant {
		t.Errorf("alice's settings = %+v after bob wrote his, want %+v", got, alicesWant)
	}
}

// A row can be missing on an account that predates migration 00007's backfill.
// Defaults are a better answer than a preferences screen that will not load.
func TestSettingsFallBackToDefaultsWithNoRow(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	if _, err := a.store.Pool().Exec(a.ctx,
		"DELETE FROM user_settings WHERE user_id = $1", c.userID); err != nil {
		t.Fatalf("removing the settings row: %v", err)
	}

	want := defaults()
	if got := getSettings(t, c); got != want {
		t.Errorf("settings = %+v with no row, want the defaults %+v", got, want)
	}

	// And writing works, because the query upserts rather than updating — an
	// UPDATE would affect no rows and save nothing while looking like it had.
	res := c.do(http.MethodPatch, "/settings", settingsBody{
		DefaultDurationMinutes: 30, FocusStepN: 6, RotaEnabled: true,
	})
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("PATCH with no existing row = %d, want 200", res.StatusCode)
	}
	if got := getSettings(t, c).DefaultDurationMinutes; got != 30 {
		t.Errorf("duration = %d after writing with no prior row, want 30", got)
	}
}

// ── The language setting (00014, ticket 11 I2, D-094) ───────────────────────

// A new account has not chosen a language, and that has to be a state the API
// can express. If it defaulted to "id" here, Accept-Language would be dead for
// everyone with an account — the middle step of D-094's order would exist only
// on the signed-out screens.
func TestLocaleStartsUnchosen(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	if got := getSettings(t, c); got.Locale != nil {
		t.Errorf("a new account's locale = %q, want none", localeOf(got))
	}
}

func TestLocaleRoundTrips(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	for _, want := range []*string{ptr("en"), ptr("id"), nil} {
		body := defaults()
		body.Locale = want

		res := c.do(http.MethodPatch, "/settings", body)
		res.Body.Close()
		if res.StatusCode != http.StatusOK {
			t.Fatalf("PATCH with locale %v = %d, want 200", want, res.StatusCode)
		}

		// Read back rather than trusting the echo. The nil case is the one
		// that matters most: clearing the choice has to be possible, or a
		// person who tried English can never get back to following their
		// browser.
		got := getSettings(t, c)
		switch {
		case want == nil && got.Locale != nil:
			t.Errorf("locale = %q after clearing it, want none", localeOf(got))
		case want != nil && (got.Locale == nil || *got.Locale != *want):
			t.Errorf("locale = %q, want %q", localeOf(got), *want)
		}
	}
}

// A locale with no catalog behind it must not reach the database. The CHECK
// constraint in 00014 is the other mechanism; this is the one that produces a
// sentence rather than a 500 (hard rule 9).
func TestLocaleRefusesOneWeHaveNoCopyFor(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	for _, bad := range []string{"pt-BR", "en-US", "ID", "", "../en", "id,en"} {
		t.Run(bad, func(t *testing.T) {
			body := defaults()
			body.Locale = ptr(bad)

			res := c.do(http.MethodPatch, "/settings", body)
			res.Body.Close()
			if res.StatusCode != http.StatusBadRequest {
				t.Errorf("PATCH with locale %q = %d, want 400", bad, res.StatusCode)
			}
		})
	}

	if got := getSettings(t, c); got.Locale != nil {
		t.Errorf("locale = %q after refused writes, want none", localeOf(got))
	}
}

// The tenancy test for the new column (hard rule 4, D-039).
//
// The endpoint is unaddressed — the caller is the key — so what this guards is
// an upsert that wrote the wrong user's row, which would silently change
// somebody else's language. 404 rather than 403 does not arise here because
// there is no id to get wrong; the equivalent assertion is that the other
// account's row is untouched and still reads as its own.
func TestLocaleIsScopedToTheAccount(t *testing.T) {
	a := newApp(t)
	alice := a.newClient(t)
	bob := a.newClient(t)

	body := defaults()
	body.Locale = ptr("en")
	res := alice.do(http.MethodPatch, "/settings", body)
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("alice's PATCH = %d, want 200", res.StatusCode)
	}

	if got := getSettings(t, bob); got.Locale != nil {
		t.Errorf("bob's locale = %q after alice chose hers, want none", localeOf(got))
	}

	// The other direction: bob choosing Indonesian must not repaint alice.
	bobs := defaults()
	bobs.Locale = ptr("id")
	out := bob.do(http.MethodPatch, "/settings", bobs)
	out.Body.Close()

	got := getSettings(t, alice)
	if got.Locale == nil || *got.Locale != "en" {
		t.Errorf("alice's locale = %q after bob chose his, want en", localeOf(got))
	}
}

// /auth/me carries the choice, because it is the only account endpoint an
// unverified account can reach — and "check your mail" is the screen a new
// account is most likely to be stuck reading.
func TestMeCarriesTheAccountLocale(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	type meBody struct {
		Locale *string `json:"locale"`
	}

	var before meBody
	c.expect(c.do(http.MethodGet, "/auth/me", nil), http.StatusOK, &before)
	if before.Locale != nil {
		t.Errorf("/auth/me locale = %q before choosing, want null", *before.Locale)
	}

	body := defaults()
	body.Locale = ptr("en")
	res := c.do(http.MethodPatch, "/settings", body)
	res.Body.Close()

	// This is also the wiring test for requireUser: the field is read out of
	// the context that withAccountLocale populates, so a middleware that never
	// ran would answer null here.
	var after meBody
	c.expect(c.do(http.MethodGet, "/auth/me", nil), http.StatusOK, &after)
	if after.Locale == nil || *after.Locale != "en" {
		t.Errorf("/auth/me locale = %v after choosing en, want en", after.Locale)
	}
}

// Login answers with the user, and the client writes that answer straight into
// the cache /auth/me would otherwise fill. A login that omitted the locale
// would leave the app in the negotiated language until something refetched.
func TestLoginCarriesTheAccountLocale(t *testing.T) {
	a := newApp(t)
	c := a.newClient(t)

	body := defaults()
	body.Locale = ptr("en")
	res := c.do(http.MethodPatch, "/settings", body)
	res.Body.Close()

	again := login(t, a.srv, c.email, testPassword)
	defer again.Body.Close()

	var out struct {
		Locale *string `json:"locale"`
	}
	if err := json.NewDecoder(again.Body).Decode(&out); err != nil {
		t.Fatalf("decoding the login response: %v", err)
	}
	if out.Locale == nil || *out.Locale != "en" {
		t.Errorf("login locale = %v, want en", out.Locale)
	}
}
