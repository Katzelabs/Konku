package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Katzelabs/Konku/internal/i18n"
)

// Locale resolution (ticket 11 I2, D-094).
//
// No database here on purpose: everything below is either string parsing or
// context plumbing, and both are the parts that decide what language a
// stranger reads the login screen in. The account half is asserted against a
// real server in settings_test.go, where there is an account.

func TestAcceptLanguage(t *testing.T) {
	for _, tc := range []struct {
		name   string
		header string
		want   i18n.Locale
	}{
		{"absent", "", i18n.ID},
		{"exactly a locale we have", "en", i18n.EN},
		{"indonesian", "id", i18n.ID},

		// Regional tags. The catalog has no en-GB, and answering "we have no
		// copy for that" would be a worse answer than English.
		{"regional english", "en-GB", i18n.EN},
		{"regional indonesian", "id-ID", i18n.ID},
		{"case is not significant", "EN-us", i18n.EN},

		// Quality values decide, not position. Chrome writes the list in
		// descending q already, but nothing requires a client to.
		{"weights beat order", "id;q=0.2,en;q=0.9", i18n.EN},
		{"weights beat order, reversed", "en;q=0.2,id;q=0.9", i18n.ID},
		{"first wins a tie", "en,id", i18n.EN},
		{"first wins an explicit tie", "id;q=0.8,en;q=0.8", i18n.ID},

		// Languages we have no copy for are skipped rather than matched,
		// which is the whole reason this is not a general BCP-47 matcher: a
		// matcher that can answer "pt-BR" answers with a locale that has no
		// catalog behind it.
		{"a language we do not have", "pt-BR", i18n.ID},
		{"the one we have, behind ones we do not", "pt-BR,ja;q=0.9,en;q=0.1", i18n.EN},
		{"wildcard only", "*", i18n.ID},
		{"wildcard beside a match", "*;q=0.9,en;q=0.1", i18n.EN},

		// The header is user input. Nothing in it is worth a failed request.
		{"junk", "!!!!", i18n.ID},
		{"empty entries", ",,,", i18n.ID},
		{"whitespace", "  en  ;  q = 0.9 ", i18n.EN},
		{"malformed q reads as unweighted", "en;q=banana", i18n.EN},
		{"out-of-range q reads as unweighted", "en;q=7", i18n.EN},
		{"explicitly unacceptable is not selected", "en;q=0", i18n.ID},
		{"unacceptable english, acceptable indonesian", "en;q=0,id;q=0.5", i18n.ID},

		// Not a prefix match: a locale is a language tag, not a substring.
		{"a longer tag that merely starts with one", "eng", i18n.ID},
		{"another", "ide", i18n.ID},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := acceptLanguage(tc.header); got != tc.want {
				t.Errorf("acceptLanguage(%q) = %q, want %q", tc.header, got, tc.want)
			}
		})
	}
}

// The middleware is what makes the parser reachable, and it has to run for
// routes with no account behind them — the login, verify and reset screens are
// exactly where a stranger meets this app.
func TestNegotiateLocaleReachesTheHandler(t *testing.T) {
	var seen i18n.Locale
	h := negotiateLocale(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen = i18n.FromContext(r.Context())
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	h.ServeHTTP(httptest.NewRecorder(), req)

	if seen != i18n.EN {
		t.Errorf("locale in the handler = %q, want %q", seen, i18n.EN)
	}
}

// FromContext never returns an empty locale, so a request with no header at
// all still reaches a handler that can look a message up. Indonesian is the
// fallback by rule (hard rule 8).
func TestNegotiateLocaleAlwaysSetsOne(t *testing.T) {
	var seen i18n.Locale
	h := negotiateLocale(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen = i18n.FromContext(r.Context())
	}))

	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	if seen != i18n.Default {
		t.Errorf("locale with no header = %q, want %q", seen, i18n.Default)
	}
}

// The layering, in isolation. This is the guard on the mistake that would be
// invisible in production for exactly one release: WithLocale replaces an
// unknown locale with the default, so calling it unconditionally would turn
// every account that has never chosen a language — which is all of them, the
// day 00014 ships — into an account pinned to Indonesian regardless of what
// its browser asked for.
func TestAccountLocaleOnlyOverridesWhenThereIsOne(t *testing.T) {
	base := i18n.WithLocale(t.Context(), i18n.EN)

	for _, tc := range []struct {
		name   string
		choice i18n.Locale
		want   i18n.Locale
		stored i18n.Locale
	}{
		{"never chosen leaves the negotiated answer", "", i18n.EN, ""},
		{"garbage leaves it too", "pt-BR", i18n.EN, ""},
		{"a real choice wins", i18n.ID, i18n.ID, i18n.ID},
		{"even when it agrees", i18n.EN, i18n.EN, i18n.EN},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := withAccountLocale(base, tc.choice)
			if got := i18n.FromContext(ctx); got != tc.want {
				t.Errorf("resolved = %q, want %q", got, tc.want)
			}
			// And the raw choice survives separately, because /auth/me has to
			// be able to say "this account has never chosen" — which is a
			// different fact from "chose Indonesian" and is what leaves the
			// client's own navigator.language answer standing.
			if got := accountLocaleFrom(ctx); got != tc.stored {
				t.Errorf("stored choice = %q, want %q", got, tc.stored)
			}
		})
	}
}
