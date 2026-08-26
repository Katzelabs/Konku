package i18n

import (
	"fmt"
	"reflect"
	"sort"
	"strings"
)

// Missing reports the paths of every leaf in v that was never written.
//
// # Why this exists
//
// `web/src/i18n/types.ts` makes a key that exists in Indonesian and not in
// English a compile error, because TypeScript has no zero value: a `Copy`
// literal missing a field does not typecheck. Go does have one. Two catalogs of
// the same struct type are structurally identical no matter what either of them
// left out, and an unwritten field is `""` or a nil func — which reaches a
// reader as a blank message, and a blank message is the one bug nobody reports,
// because there is nothing on the screen to report.
//
// So the type is the first mechanism and this is the second (hard rule 9). It
// is production code rather than a test helper because two packages need it:
// `internal/i18n` runs it over both catalogs, and `internal/mail` runs it over
// the per-locale mail copy, which cannot live here because a parsed template is
// not a string.
//
// # What counts as missing
//
// An empty string, a nil func, a nil pointer, a nil interface, a nil map or
// slice, and — for a func that can be called with zero values — a result that
// is empty. That last one is what catches a translated sentence that
// interpolates its argument and forgets the rest of itself.
//
// A non-nil pointer is written, and the walk stops there rather than descending
// into whatever it points at. See the comment in walk.
//
// Anything else (numbers, bools, non-empty values) is left alone. A catalog has
// no legitimate empty leaf: a string nobody wants is a key nobody should have
// declared.
//
// Paths are dotted and sorted, so a failure names the leaf rather than the
// struct: `Auth.PasswordTooShort`, not "something in AuthCopy".
func Missing(v any) []string {
	root := reflect.ValueOf(v)
	// One dereference at the top, so Missing(&catalog) and Missing(catalog)
	// mean the same thing. Pointer *fields* below are not followed — see walk.
	for root.Kind() == reflect.Pointer || root.Kind() == reflect.Interface {
		if root.IsNil() {
			return []string{""}
		}
		root = root.Elem()
	}

	var out []string
	walk(root, "", &out)
	sort.Strings(out)
	return out
}

func walk(v reflect.Value, path string, out *[]string) {
	switch v.Kind() {
	case reflect.Invalid:
		*out = append(*out, path)

	case reflect.Pointer, reflect.Interface:
		// Nil is missing; anything else is written, and the walk stops there.
		//
		// It does not follow the pointer, and that is not laziness — the mail
		// copy holds *template.Template, and a parsed template is a tree of
		// unexported-but-reachable nodes with plenty of legitimately empty
		// fields. Following it reported six "missing" leaves inside the parser's
		// own AST. A catalog leaf is a string, a func, or a value that either
		// exists or does not.
		if v.IsNil() {
			*out = append(*out, path)
		}

	case reflect.Struct:
		t := v.Type()
		for i := 0; i < v.NumField(); i++ {
			// Unexported fields are not copy — nothing outside the package
			// could have written one, so their zero value proves nothing.
			if !t.Field(i).IsExported() {
				continue
			}
			walk(v.Field(i), join(path, t.Field(i).Name), out)
		}

	case reflect.String:
		if strings.TrimSpace(v.String()) == "" {
			*out = append(*out, path)
		}

	case reflect.Func:
		if v.IsNil() {
			*out = append(*out, path)
			return
		}
		if s, ok := probe(v); ok && strings.TrimSpace(s) == "" {
			*out = append(*out, path)
		}

	case reflect.Map, reflect.Slice:
		if v.IsNil() || v.Len() == 0 {
			*out = append(*out, path)
			return
		}
		if v.Kind() == reflect.Slice {
			for i := 0; i < v.Len(); i++ {
				walk(v.Index(i), fmt.Sprintf("%s[%d]", path, i), out)
			}
			return
		}
		for _, k := range v.MapKeys() {
			walk(v.MapIndex(k), fmt.Sprintf("%s[%v]", path, k.Interface()), out)
		}
	}
}

// probe calls a single-result string func with zero values and reports what it
// produced. It reports false for a signature it cannot drive — a func that
// cannot be probed is not evidence of anything, and a panic here would be a
// test failing for the wrong reason.
func probe(v reflect.Value) (s string, ok bool) {
	t := v.Type()
	if t.IsVariadic() || t.NumOut() != 1 || t.Out(0).Kind() != reflect.String {
		return "", false
	}

	defer func() {
		if recover() != nil {
			s, ok = "", false
		}
	}()

	args := make([]reflect.Value, t.NumIn())
	for i := range args {
		args[i] = reflect.Zero(t.In(i))
	}
	return v.Call(args)[0].String(), true
}

func join(path, name string) string {
	if path == "" {
		return name
	}
	return path + "." + name
}
