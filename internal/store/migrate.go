package store

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/Katzelabs/Konku/migrations"
)

// Migrate applies all pending migrations from the embedded files.
//
// Running at startup means a deploy is just "run the binary" — there is no
// separate migrate step to forget, and no window where a new binary serves
// against an old schema.
//
// The caller must treat a failure here as fatal. Serving against a
// half-migrated schema produces errors that look like application bugs and
// waste an afternoon each time.
func (s *Store) Migrate(ctx context.Context) error {
	// goose speaks database/sql, so borrow a *sql.DB backed by the same pgx
	// pool rather than opening a second connection path to the database.
	db := stdlib.OpenDBFromPool(s.pool)
	defer db.Close()

	goose.SetBaseFS(migrations.FS)
	goose.SetLogger(gooseLogger{})

	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("store: goose dialect: %w", err)
	}

	before, err := goose.GetDBVersionContext(ctx, db)
	if err != nil {
		return fmt.Errorf("store: reading schema version: %w", err)
	}

	// "." because the embed pattern is rooted at the migrations package.
	if err := goose.UpContext(ctx, db, "."); err != nil {
		return fmt.Errorf("store: applying migrations: %w", err)
	}

	after, err := goose.GetDBVersionContext(ctx, db)
	if err != nil {
		return fmt.Errorf("store: reading schema version: %w", err)
	}

	if before == after {
		slog.Info("schema up to date", "version", after)
	} else {
		slog.Info("migrations applied", "from", before, "to", after)
	}
	return nil
}

// gooseLogger routes goose's output through slog so startup logs stay
// structured instead of goose printing raw lines to stdout.
type gooseLogger struct{}

func (gooseLogger) Printf(format string, v ...any) {
	slog.Info("goose: " + trimNewline(fmt.Sprintf(format, v...)))
}

// Fatalf must not exit the process: the caller decides what a migration
// failure means, and goose calling os.Exit would skip our shutdown path.
func (gooseLogger) Fatalf(format string, v ...any) {
	slog.Error("goose: " + trimNewline(fmt.Sprintf(format, v...)))
}

func trimNewline(s string) string {
	for len(s) > 0 && (s[len(s)-1] == '\n' || s[len(s)-1] == '\r') {
		s = s[:len(s)-1]
	}
	return s
}
