// Package migrations embeds the goose migration files.
//
// The .sql files live here rather than under internal/ so the goose CLI still
// works directly against them (`make migrate-up`), while the embedded copy
// lets the binary migrate itself at startup — a deploy is then just "run the
// binary", with no separate migrate step that can be forgotten or run against
// the wrong database.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
