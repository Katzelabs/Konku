// Package web embeds the built React application.
//
// Vite writes its output directly here (build.outDir in web/vite.config.ts),
// so there is no copy step. The dist/.gitkeep file is committed on purpose:
// //go:embed is a compile-time directive, so a missing directory breaks
// `go build` on a fresh clone before the frontend has ever been built.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// FS returns the built frontend rooted at dist/, ready to serve.
func FS() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		// Only possible if the embed directive above is wrong.
		panic(err)
	}
	return sub
}
