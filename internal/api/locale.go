package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/Katzelabs/Konku/internal/i18n"
)

// Locale resolution for a request (ticket 11 I2, D-094).
//
// The order is **account setting → Accept-Language → id**, and it is resolved
// in two places because the three inputs do not all arrive at the same time:
//
//   - negotiateLocale runs above every route — including the unauthenticated
//     ones and the SPA shell — and answers from Accept-Language, falling back
//     to Indonesian. A signed-out reader gets a language too, and the screens
//     they see the most (login, verify, reset) are the ones an unauthenticated
//     middleware is the only thing that can reach.
//   - requireUser layers the account's stored choice over that answer, because
//     it is the first point in the request where there is an account. It costs
//     nothing extra: 00014's column rides along on GetActiveSession, which
//     already runs on every authenticated request.
//
// Nothing else in the request path calls i18n.WithLocale. The seam that
// package documents stays a seam only while that is true.

// negotiateLocale resolves the request's locale from Accept-Language.
//
// Mounted above the routes rather than per-handler, for the same reason
// enforceOrigin is: a new endpoint is covered the moment it is added rather
// than when somebody remembers. It is also mounted **above recoverer**, so the
// error shape a panic produces is in the reader's language rather than in
// whatever the fallback is — a 500 is still a sentence somebody reads.
func negotiateLocale(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Always sets something, even when the header is missing or useless.
		// WithLocale replaces an unknown locale with the default, so what
		// FromContext returns downstream is always a locale with a catalog.
		l := acceptLanguage(r.Header.Get("Accept-Language"))
		next.ServeHTTP(w, r.WithContext(i18n.WithLocale(r.Context(), l)))
	})
}

// acceptLanguage picks the best locale this application has copy for out of an
// Accept-Language header, or Default when the header names none of them.
//
// Deliberately small, and deliberately not golang.org/x/text (D-065): the
// obligation is "choose between two languages", and a full BCP-47 matcher can
// answer "pt-BR" — a locale with no catalog behind it, which is precisely the
// answer i18n.Valid exists to refuse. Two languages do not need a matcher.
//
// The header is user input and this parser treats it as such: anything it
// cannot make sense of is skipped rather than rejected, and the worst case is
// the documented fallback rather than a failed request.
func acceptLanguage(header string) i18n.Locale {
	best := i18n.Default
	// Strictly greater than, so the first entry at a given quality wins — the
	// header's own order is the tiebreak, which is what a client that writes
	// "en,id" without weights means.
	bestQ := 0.0

	for _, part := range strings.Split(header, ",") {
		tag, q := languageRange(part)
		if tag == "" || q <= bestQ {
			continue
		}
		// Only the primary subtag is compared: "en-GB", "en-US" and "en" are
		// all English as far as this catalog is concerned, and "id-ID" is
		// Indonesian. A wildcard "*" has no primary subtag we have copy for
		// and falls out here.
		primary, _, _ := strings.Cut(tag, "-")
		l := i18n.Locale(strings.ToLower(primary))
		if !i18n.Valid(l) {
			continue
		}
		best, bestQ = l, q
	}

	return best
}

// languageRange splits one comma-separated entry into its tag and its quality.
//
// A malformed q is treated as absent rather than as zero: "en;q=banana" is a
// client that meant English and got its own header wrong, and reading that as
// "English is unacceptable" would be a worse guess than reading it as 1.
// An explicit q=0 does mean unacceptable, and falls out of the caller's
// `q <= bestQ` because bestQ starts there.
func languageRange(part string) (tag string, q float64) {
	tag, params, hasParams := strings.Cut(strings.TrimSpace(part), ";")
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return "", 0
	}
	if !hasParams {
		return tag, 1
	}

	for _, param := range strings.Split(params, ";") {
		name, value, ok := strings.Cut(param, "=")
		if !ok || !strings.EqualFold(strings.TrimSpace(name), "q") {
			continue
		}
		parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil || parsed < 0 || parsed > 1 {
			continue
		}
		return tag, parsed
	}

	return tag, 1
}

// accountChoiceKey carries the account's *stored* locale, which is a different
// value from the resolved one and is needed by exactly one handler.
//
// The resolved locale — what the server writes copy in — lives in
// i18n.FromContext and is never empty. This is the raw column: empty when the
// account has never chosen, which is the state /auth/me has to be able to
// report so the client knows its own navigator.language answer still stands.
// Collapsing the two would make "chose Indonesian" and "never chose"
// indistinguishable to the one caller that has to tell them apart.
type accountChoiceKey struct{}

// withAccountLocale layers an account's stored choice over the negotiated
// locale, and records the raw choice for /auth/me.
//
// An empty or unknown choice leaves the negotiated answer alone. That guard is
// load-bearing rather than defensive: i18n.WithLocale replaces an unknown
// locale with the default, so calling it unconditionally would overwrite a
// perfectly good Accept-Language answer with Indonesian for every account that
// has never picked a language — which is every account, on the day 00014 ships.
func withAccountLocale(ctx context.Context, choice i18n.Locale) context.Context {
	ctx = context.WithValue(ctx, accountChoiceKey{}, choice)
	if !i18n.Valid(choice) {
		return ctx
	}
	return i18n.WithLocale(ctx, choice)
}

// accountLocaleFrom returns the account's stored choice, or "" when it has
// none. Only meaningful behind requireUser.
func accountLocaleFrom(ctx context.Context) i18n.Locale {
	if l, ok := ctx.Value(accountChoiceKey{}).(i18n.Locale); ok && i18n.Valid(l) {
		return l
	}
	return ""
}
