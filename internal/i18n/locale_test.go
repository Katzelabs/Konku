package i18n

import (
	"context"
	"testing"
)

func TestFromContextDefaultsToIndonesian(t *testing.T) {
	if got := FromContext(context.Background()); got != ID {
		t.Fatalf("bare context: got %q, want %q", got, ID)
	}
}

func TestWithLocaleRoundTrips(t *testing.T) {
	for _, l := range Locales {
		ctx := WithLocale(context.Background(), l)
		if got := FromContext(ctx); got != l {
			t.Errorf("WithLocale(%q): got %q", l, got)
		}
	}
}

func TestUnknownLocaleFallsBackRatherThanLeaking(t *testing.T) {
	// Both of I2's inputs are user input. A locale with no catalog behind it
	// must never reach a caller, because every caller is entitled to assume
	// what it gets can be looked up.
	for _, bad := range []Locale{"", "pt-BR", "en-US", "ID", "../en"} {
		ctx := WithLocale(context.Background(), bad)
		if got := FromContext(ctx); got != Default {
			t.Errorf("WithLocale(%q): got %q, want %q", bad, got, Default)
		}
	}
}

func TestValid(t *testing.T) {
	for _, l := range Locales {
		if !Valid(l) {
			t.Errorf("Valid(%q) = false, want true", l)
		}
	}
	for _, bad := range []Locale{"", "pt", "EN", "id-ID"} {
		if Valid(bad) {
			t.Errorf("Valid(%q) = true, want false", bad)
		}
	}
}

// The server's locale set and the frontend's must not drift: a reader served a
// page in one language and an API error in another is the failure this whole
// ticket exists to prevent. web/src/i18n/types.ts declares `'id' | 'en'`.
func TestLocalesMatchTheFrontend(t *testing.T) {
	want := map[Locale]bool{"id": true, "en": true}
	if len(Locales) != len(want) {
		t.Fatalf("Locales has %d entries, frontend declares %d", len(Locales), len(want))
	}
	for _, l := range Locales {
		if !want[l] {
			t.Errorf("Locales carries %q, which web/src/i18n/types.ts does not", l)
		}
	}
	if Default != ID {
		t.Errorf("Default is %q; hard rule 8 makes Indonesian the fallback", Default)
	}
}
