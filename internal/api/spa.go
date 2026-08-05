package api

import (
	"errors"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

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
				}
				fileServer.ServeHTTP(w, r)
				return
			} else if !errors.Is(err, fs.ErrNotExist) {
				writeInternal(w, err)
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
