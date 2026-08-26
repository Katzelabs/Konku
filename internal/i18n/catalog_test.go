package i18n

import (
	"reflect"
	"sort"
	"strings"
	"testing"
)

// The second mechanism (hard rule 9).
//
// The `Catalog` type is the first, and in Go it is weaker than TypeScript's
// `Copy`: both catalogs are the same type whatever either of them left out,
// because Go has a zero value. `Missing` closes that, and everything below
// closes the holes `Missing` cannot see — an English leaf that is a verbatim
// copy of the Indonesian, a format verb that survived into the output, a
// sentence that scolds.

func bothCatalogs() map[Locale]*Catalog {
	return map[Locale]*Catalog{ID: &idCatalog, EN: &enCatalog}
}

func TestEveryLocaleHasACatalog(t *testing.T) {
	// A Locale added to `Locales` with no catalog behind it would be served by
	// `For` as Indonesian, silently. FromContext's contract is that what comes
	// back is always a locale with a catalog behind it; this is the half of
	// that promise this file owns.
	for _, l := range Locales {
		if _, ok := catalogs[l]; !ok {
			t.Errorf("Locales carries %q with no catalog behind it", l)
		}
	}
	if len(catalogs) != len(Locales) {
		t.Errorf("catalogs holds %d entries, Locales declares %d", len(catalogs), len(Locales))
	}
}

func TestNoLeafIsUnwritten(t *testing.T) {
	// This is the missing-key check, and it runs in both directions by
	// construction: every catalog is the same struct, so a key present in one
	// and absent in the other shows up here as the absent one being empty.
	for l, c := range bothCatalogs() {
		if missing := Missing(c); len(missing) > 0 {
			t.Errorf("%s.go has %d unwritten leaves:\n  %s",
				l, len(missing), strings.Join(missing, "\n  "))
		}
	}
}

func TestForNeverReturnsNil(t *testing.T) {
	for _, l := range append([]Locale{"", "pt-BR", "EN"}, Locales...) {
		if For(l) == nil {
			t.Errorf("For(%q) returned nil", l)
		}
	}
	if For("pt-BR") != For(Default) {
		t.Error("an unknown locale must fall back to the default catalog")
	}
}

func TestNothingIsLeftUntranslated(t *testing.T) {
	// `Missing` cannot see the likeliest way `en.go` goes wrong: a leaf
	// copy-pasted from `id.go` and never touched. It has a written value, it
	// has the right type, and it renders Indonesian to an English reader.
	//
	// Nothing in this catalog is legitimately identical across the two
	// languages — every leaf is a whole sentence. If that ever stops being
	// true, add the leaf here with the reason rather than deleting the test.
	sameOnPurpose := map[string]string{}

	same := identical(reflect.ValueOf(idCatalog), reflect.ValueOf(enCatalog))
	var bad []string
	for _, path := range same {
		if _, ok := sameOnPurpose[path]; !ok {
			bad = append(bad, path)
		}
	}
	sort.Strings(bad)

	if len(bad) > 0 {
		t.Errorf("identical in id.go and en.go, so one of them was never translated:\n  %s",
			strings.Join(bad, "\n  "))
	}
}

func TestNoFormatVerbSurvivesIntoOutput(t *testing.T) {
	// A `%d` on the screen means a Sprintf lost an argument in translation,
	// and `%!d(MISSING)` means it lost the argument entirely. Both compile.
	for l, c := range bothCatalogs() {
		for path, s := range renderAll(reflect.ValueOf(*c)) {
			if strings.Contains(s, "%!") {
				t.Errorf("%s.go %s: Sprintf reported a bad argument: %q", l, path, s)
			}
			// The probe calls every func with zero values, so a surviving verb
			// is a verb the format string never consumed.
			for _, verb := range []string{"%d", "%s", "%v", "%q"} {
				if strings.Contains(s, verb) {
					t.Errorf("%s.go %s: unconsumed %s in %q", l, path, verb, s)
				}
			}
		}
	}
}

func TestNeverPunitive(t *testing.T) {
	// Hard rule 6, and the same list `web/src/i18n/catalog.test.ts` uses,
	// because the failure is the same one. Not a complete list of ways to
	// blame somebody — there is no such list — which is why the paragraph at
	// the top of `en.go` is the real instruction and this is the backstop.
	banned := map[Locale][]string{
		EN: {
			"don't forget", "do not forget", "remember to", "make sure you",
			"you missed", "you forgot", "you should have", "you failed",
			"you fell behind", "falling behind", "behind on", "overdue",
			"streak", "keep it up", "stay on track", "don't break",
			"oops", "uh oh", "!",
		},
		ID: {"jangan lupa", "kamu lupa", "kamu gagal", "jangan sampai", "seharusnya", "beruntun", "!"},
	}

	for l, c := range bothCatalogs() {
		for path, s := range renderAll(reflect.ValueOf(*c)) {
			lower := strings.ToLower(s)
			for _, phrase := range banned[l] {
				if strings.Contains(lower, phrase) {
					t.Errorf("%s.go %s: %q — %q", l, path, phrase, s)
				}
			}
		}
	}
}

func TestGroupFormatsForTheLocaleThatAsked(t *testing.T) {
	// 07 L8's quotas are 5.000 notes and 20.000 cards. A bare strconv.Itoa
	// prints 5000, which is wrong in both languages.
	cases := []struct {
		n    int
		sep  string
		want string
	}{
		{0, dot, "0"},
		{999, dot, "999"},
		{1000, dot, "1.000"},
		{5000, dot, "5.000"},
		{20000, comma, "20,000"},
		{300, comma, "300"},
		{1234567, comma, "1,234,567"},
		{-5000, dot, "-5.000"},
	}
	for _, tc := range cases {
		if got := group(tc.n, tc.sep); got != tc.want {
			t.Errorf("group(%d, %q) = %q, want %q", tc.n, tc.sep, got, tc.want)
		}
	}

	// And the catalogs actually use it, rather than each having reached for
	// strconv on its own.
	if got := idCatalog.Quota.Notes(5000); !strings.Contains(got, "5.000") {
		t.Errorf("Indonesian quota message does not group with a dot: %q", got)
	}
	if got := enCatalog.Quota.Notes(5000); !strings.Contains(got, "5,000") {
		t.Errorf("English quota message does not group with a comma: %q", got)
	}
}

func TestMissingReportsTheLeafThatIsBlank(t *testing.T) {
	// The mechanism needs its own test, or it is a hope that a test is
	// running. A catalog with two holes in it must name both.
	var hollow Catalog
	hollow.Common.BadRequest = "ada"

	missing := Missing(&hollow)
	if len(missing) == 0 {
		t.Fatal("Missing reported nothing for an empty catalog")
	}
	if contains(missing, "Common.BadRequest") {
		t.Error("Missing reported a leaf that was written")
	}
	for _, want := range []string{"Common.NotFound", "Common.ServerErrorWithCode", "Quota.Notes"} {
		if !contains(missing, want) {
			t.Errorf("Missing did not report %s", want)
		}
	}

	// A func that returns nothing is as blank as a field nobody filled in.
	blank := Catalog{}
	blank.Auth.PasswordTooShort = func(int) string { return "  " }
	if !contains(Missing(&blank), "Auth.PasswordTooShort") {
		t.Error("Missing did not report a func that produces an empty string")
	}
}

// renderAll walks a catalog and returns every string it can produce, keyed by
// path. Funcs are called with zero values, which is enough to see the sentence
// around the argument.
func renderAll(v reflect.Value) map[string]string {
	out := map[string]string{}
	render(v, "", out)
	return out
}

func render(v reflect.Value, path string, out map[string]string) {
	switch v.Kind() {
	case reflect.Struct:
		t := v.Type()
		for i := 0; i < v.NumField(); i++ {
			render(v.Field(i), join(path, t.Field(i).Name), out)
		}
	case reflect.String:
		out[path] = v.String()
	case reflect.Func:
		if s, ok := probe(v); ok {
			out[path] = s
		}
	}
}

// identical returns the paths whose rendered value is the same in both
// catalogs.
func identical(a, b reflect.Value) []string {
	left, right := renderAll(a), renderAll(b)
	var same []string
	for path, s := range left {
		if other, ok := right[path]; ok && s == other {
			same = append(same, path)
		}
	}
	return same
}

func contains(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}
