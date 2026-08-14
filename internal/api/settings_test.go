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
	want := settingsBody{DefaultDurationMinutes: 20, FocusStepN: 5, RotaEnabled: true}
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
	want := settingsBody{DefaultDurationMinutes: 20, FocusStepN: 5, RotaEnabled: true}
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
	want := settingsBody{DefaultDurationMinutes: 20, FocusStepN: 5, RotaEnabled: true}
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

	want := settingsBody{DefaultDurationMinutes: 20, FocusStepN: 5, RotaEnabled: true}
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
