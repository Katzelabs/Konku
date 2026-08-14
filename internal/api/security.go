package api

import (
	"net/http"
	"net/url"
	"strings"
)

// Browser hardening (D-060, P4).
//
// The threat model is narrow and worth stating, because it is what justifies
// *not* building a synchroniser-token CSRF layer: the SPA and the API are the
// same origin (D-040), every state-changing request is JSON, and the session
// cookie is HttpOnly, Secure and SameSite=Lax.
//
// Given that, a cross-site form POST does not carry the cookie at all, and a
// cross-site fetch with Content-Type: application/json is preflighted and
// refused. The controls below close what remains.

// contentSecurityPolicy is the production policy.
//
// No 'unsafe-inline' anywhere, and no 'unsafe-eval'. Those two are the whole
// point: a stored-XSS in a note is already prevented by the markdown renderer
// emitting React elements rather than HTML (D-018), and this is the second
// mechanism behind that (hard rule 9).
//
//   - default-src 'self'   — deny by default, then allow what is needed
//   - img-src ... data:    — Vite inlines small assets as data URIs
//   - connect-src 'self'   — the API only. Sentry runs server-side, so the
//     browser never talks to it and does not need an exception
//   - frame-ancestors 'none' — clickjacking; supersedes X-Frame-Options
//   - base-uri 'none'      — stops an injected <base> re-pointing every
//     relative URL on the page
//   - form-action 'self'   — an injected form cannot post credentials out
//   - object-src 'none'    — no plugins, ever
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self'; " +
	"img-src 'self' data:; " +
	"font-src 'self'; " +
	"connect-src 'self'; " +
	"frame-ancestors 'none'; " +
	"base-uri 'none'; " +
	"form-action 'self'; " +
	"object-src 'none'"

// securityHeaders sets the header set that should have existed anyway.
//
// HSTS is deliberately absent: Caddy terminates TLS and is the only component
// that knows whether the connection was actually secure. Setting it here would
// mean guessing from a forwarded header, and a wrong Strict-Transport-Security
// is not something you can take back within its max-age.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		// Stops a browser guessing that a JSON error body is HTML and running
		// it — the classic route from "uploads a file" to "executes a script".
		h.Set("X-Content-Type-Options", "nosniff")
		// Send the origin but never the path: a note's URL carries its uuid,
		// and there is no reason for any third party to receive it.
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		// frame-ancestors covers this for modern browsers; kept for the ones
		// that only understand the old header.
		h.Set("X-Frame-Options", "DENY")
		// Nothing here uses a camera, a microphone or a location.
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
		// Severs the window.opener reference, so a page this one opens — or one
		// that opened it — cannot reach into it. frame-ancestors already stops
		// this document being framed; this is the same isolation for the other
		// direction, which CSP does not cover.
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		// Refuses to be embedded as a subresource by another origin at all. The
		// API answers JSON about one account, and there is no reason for any
		// other site to be able to load a byte of it — including as an <img> or
		// a <script> whose failure mode leaks length or timing.
		h.Set("Cross-Origin-Resource-Policy", "same-origin")

		next.ServeHTTP(w, r)
	})
}

// safeMethod reports whether a request cannot change state, and therefore does
// not need the origin check.
func safeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions
}

// enforceOrigin is the CSRF control (D-060). There is deliberately no
// synchroniser token.
//
// Two independent conditions, either of which is enough to stop a cross-site
// write:
//
//  1. If Origin is present, it must be ours. Browsers send it on every
//     cross-origin request and on same-origin state-changing requests, so a
//     forged POST from another site arrives stamped with where it came from.
//  2. Content-Type must be application/json. An HTML form — the one
//     cross-site POST that carries no Origin in older browsers and needs no
//     JavaScript — can only send urlencoded, multipart or text/plain. It
//     cannot produce this content type, and a fetch that sets it becomes
//     preflighted and therefore refused by CORS before it ever arrives.
//
// A bodyless request is exempt from the second condition, and that is a
// deliberate narrowing rather than an oversight. `POST /auth/logout` and
// `POST /notes/{id}/restore` carry nothing, and demanding a Content-Type that
// describes no content is a strange thing to require of a client — including
// the Bearer-token consumer D-040 anticipates.
//
// It costs nothing, because a bodyless cross-site POST is still stopped twice:
// SameSite=Lax means the cookie does not ride along at all, and a fetch always
// sends Origin, so condition 1 catches it. An HTML form cannot produce a
// request with no Content-Type in the first place.
func enforceOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if safeMethod(r.Method) {
			next.ServeHTTP(w, r)
			return
		}

		if origin := r.Header.Get("Origin"); origin != "" && !sameOrigin(origin, r) {
			writeError(w, http.StatusForbidden, CodeBadRequest,
				"Permintaan ditolak karena berasal dari situs lain.")
			return
		}

		ct := r.Header.Get("Content-Type")
		switch {
		case ct != "" && !isJSONContentType(ct):
			// urlencoded, multipart or text/plain — the three an HTML form
			// can produce, and therefore the shape of a form-based CSRF.
			writeError(w, http.StatusUnsupportedMediaType, CodeBadRequest,
				"Permintaan harus berupa JSON.")
			return
		case ct == "" && r.ContentLength != 0:
			// A body with no declared type. ContentLength is -1 for chunked,
			// which counts as "has a body" here on purpose.
			writeError(w, http.StatusUnsupportedMediaType, CodeBadRequest,
				"Permintaan harus berupa JSON.")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// sameOrigin compares the Origin header's host with the host the request was
// addressed to.
//
// Host rather than the full URL: behind Caddy the app sees http:// while the
// browser saw https://, so comparing schemes would reject every real request.
// Caddy is also what makes r.Host trustworthy.
func sameOrigin(origin string, r *http.Request) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		// "null" and anything unparseable — a sandboxed iframe or a
		// file:// page. Not ours.
		return false
	}
	return strings.EqualFold(u.Host, r.Host)
}

// isJSONContentType accepts application/json with or without parameters, and
// nothing else.
func isJSONContentType(ct string) bool {
	if ct == "" {
		return false
	}
	// Strip any ;charset=utf-8 and compare the media type only.
	media, _, _ := strings.Cut(ct, ";")
	return strings.EqualFold(strings.TrimSpace(media), "application/json")
}
