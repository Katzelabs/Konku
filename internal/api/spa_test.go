package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

/*
 * How long the browser is allowed to keep a static file.
 *
 * The pair is easy to get backwards, and getting it backwards is either a
 * deploy nobody receives or a byte re-fetched on every page load. Since D-086
 * there is a third case: web/public lands at the *root* of dist, keeping the
 * name it was written with, so `theme.js` and the icons have no hash to bust.
 * A cached theme.js is a theme that stops applying before the first paint,
 * which is the bug that file exists to fix.
 */
func TestStaticCacheControl(t *testing.T) {
	dist := fstest.MapFS{
		"index.html":             {Data: []byte("<!doctype html>")},
		"assets/index-abc123.js": {Data: []byte("console.log(1)")},
		"theme.js":               {Data: []byte("// theme")},
		"favicon.svg":            {Data: []byte("<svg/>")},
		"site.webmanifest":       {Data: []byte("{}")},
	}
	handler := spaHandler(dist)

	tests := []struct {
		name  string
		path  string
		cache string
	}{
		{"hashed asset", "/assets/index-abc123.js", "public, max-age=31536000, immutable"},
		{"the theme script", "/theme.js", "no-cache"},
		{"an icon", "/favicon.svg", "no-cache"},
		{"the manifest", "/site.webmanifest", "no-cache"},
		// "/" never reaches the file server — it falls through to the same
		// index.html read as every client-side route. (A literal
		// /index.html would be redirected to "/" by net/http first.)
		{"the app itself", "/", "no-cache"},
		// The SPA fallback: a client-side route is index.html, and index.html
		// is what points at the hashed bundle. Cache it and a deploy is
		// invisible until the browser decides otherwise.
		{"a client-side route", "/notes", "no-cache"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			handler(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", rec.Code)
			}
			if got := rec.Header().Get("Cache-Control"); got != tt.cache {
				t.Errorf("Cache-Control = %q, want %q", got, tt.cache)
			}
		})
	}
}

// Go's mime table has no .webmanifest, and every response carries
// X-Content-Type-Options: nosniff — so served as text/plain, which is what
// happens by default, the manifest is one the browser may ignore outright.
func TestManifestContentType(t *testing.T) {
	handler := spaHandler(fstest.MapFS{
		"index.html":       {Data: []byte("<!doctype html>")},
		"site.webmanifest": {Data: []byte(`{"name":"Konku"}`)},
	})

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest(http.MethodGet, "/site.webmanifest", nil))

	if got := rec.Header().Get("Content-Type"); got != "application/manifest+json" {
		t.Errorf("Content-Type = %q, want application/manifest+json", got)
	}
}
