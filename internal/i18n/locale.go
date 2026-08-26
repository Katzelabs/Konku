// Package i18n carries the server's half of D-094: the app answers a request
// in the reader's language, and Indonesian is the source language and the
// fallback.
//
// This file is the *contract* and nothing else. It exists so that the two
// pieces of work that need it can be written at the same time without racing
// for the same type:
//
//   - Ticket 11 I2 owns resolution — deciding which Locale a request is in
//     (account setting → Accept-Language → id) and calling WithLocale.
//   - Ticket 11 I3 owns the catalog — the Indonesian and English message
//     tables behind writeError and every mail template — and reads the answer
//     through FromContext.
//
// Neither of those lives here. Adding resolution logic or message tables to
// this file is how the seam closes and the two halves stop being separable.
package i18n

import "context"

// Locale is a language tag the application has copy for.
//
// Deliberately a closed set rather than a golang.org/x/text language.Tag: two
// languages is the whole scope of D-094, the values must agree exactly with
// `web/src/i18n/types.ts` (`export type Locale = 'id' | 'en'`), and a matcher
// that can answer "pt-BR" is a matcher that can answer with a locale we have
// no catalog for. See D-065 — the obligation is named before the dependency,
// and this one does not need one.
type Locale string

const (
	// ID is Bahasa Indonesia: the source language, and the fallback.
	//
	// Fallback in the strong sense — every key exists here first, and a
	// question this package cannot answer is answered in Indonesian rather
	// than in nothing. Hard rule 8.
	ID Locale = "id"

	// EN is English. A string is not shippable until this exists (D-094),
	// but it is never what an unanswerable question falls back to.
	EN Locale = "en"
)

// Default is what a request gets when nothing better is known.
//
// It is ID, and that is not an arbitrary pick: an English string that has not
// been written yet is a bug the catalog's own tests catch, whereas an
// Indonesian string is guaranteed to exist. Falling back to the language that
// might be missing would turn a translation gap into a blank screen.
var Default = ID

// Locales is every locale the server has copy for, in no meaningful order.
//
// Kept in sync with `LOCALES` in web/src/i18n/index.tsx. If this list and that
// one disagree, a reader can be served a page in one language and an API error
// in another.
var Locales = []Locale{ID, EN}

// Valid reports whether l is a locale this application has copy for.
//
// Both of I2's inputs — an account setting read out of the database and an
// Accept-Language header — are user input, and neither is trustworthy enough
// to be cast straight to a Locale.
func Valid(l Locale) bool {
	for _, known := range Locales {
		if l == known {
			return true
		}
	}
	return false
}

// localeKey is the context key for the resolved locale.
//
// A private zero-width struct, matching the idiom in internal/api/logging.go:
// nothing outside this package can construct it, so nothing outside this
// package can put a value under it without going through WithLocale.
type localeKey struct{}

// WithLocale returns a context carrying l as the request's locale.
//
// I2's middleware is expected to be the only caller in the request path. An
// unknown locale is replaced with Default rather than rejected: a malformed
// Accept-Language is not worth a failed request, and the guarantee this
// function makes to FromContext's callers is that what comes back is always a
// locale with a catalog behind it.
func WithLocale(ctx context.Context, l Locale) context.Context {
	if !Valid(l) {
		l = Default
	}
	return context.WithValue(ctx, localeKey{}, l)
}

// FromContext returns the locale resolved for this request, or Default.
//
// It never fails and never returns an empty Locale. That is deliberate and it
// is what makes it safe to call from deep inside a handler: a caller that has
// to check an error before it can pick a language will eventually skip the
// check and hardcode Indonesian, which is the state this ticket is undoing.
//
// A background job, a CLI command, or any code path with no request behind it
// gets Default, which is correct — CLI output is operator-facing and stays
// English by hard rule 8, and it should not be reaching for this package.
func FromContext(ctx context.Context) Locale {
	if l, ok := ctx.Value(localeKey{}).(Locale); ok && Valid(l) {
		return l
	}
	return Default
}
