package api

import (
	"errors"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
)

// Go's built-in table has no entry for .webmanifest, so the manifest went out
// as text/plain — which, with X-Content-Type-Options: nosniff on every
// response, is a manifest the browser is entitled to ignore. Registering it is
// cheaper than renaming the file to something the table already knows.
func init() {
	if err := mime.AddExtensionType(".webmanifest", "application/manifest+json"); err != nil {
		// Only returned for an extension not starting with a dot.
		panic(err)
	}
}

// spaHandler serves the embedded React build.
//
// Any path that is not a real file falls back to index.html, which is what
// lets client-side routes survive a refresh — without it, reloading /review
// returns 404 instead of the app (D-040).
func spaHandler(dist fs.FS) http.HandlerFunc {
	fileServer := http.FileServer(http.FS(dist))

	return func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")

		if name != "" {
			if f, err := dist.Open(name); err == nil {
				f.Close()
				// Vite emits content-hashed filenames under /assets, so they
				// are safe to cache forever. index.html must never be.
				if strings.HasPrefix(name, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				} else {
					// Everything else at the root came from web/public and
					// keeps the name it was written with: theme.js, the icons,
					// the manifest. No hash means no way to bust one, and
					// theme.js in particular restates a storage key that lives
					// in the app — a stale copy is a theme that stops applying
					// before the first paint. Revalidation is one 304 on a
					// file the browser already has.
					w.Header().Set("Cache-Control", "no-cache")
				}
				fileServer.ServeHTTP(w, r)
				return
			} else if !errors.Is(err, fs.ErrNotExist) {
				writeInternal(w, r, err)
				return
			}
		}

		index, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			// The frontend has never been built. Only reachable in dev, where
			// Vite serves the app on :5173 and proxies /api here.
			writeError(w, http.StatusNotFound, CodeNotFound,
				"Frontend belum di-build. Jalankan `make dev` atau `make build`.")
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(index)
	}
}
