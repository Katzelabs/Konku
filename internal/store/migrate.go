package store

import (
	"context"
	"database/sql"
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
// migrationURL is the owner's connection string. The application pool
// connects as the non-owner konku_app, which has no DDL rights at all — that
// separation is the point (D-059): migrations and the running app are not the
// same principal, so a SQL injection in a handler cannot reach ALTER TABLE.
//
// An empty migrationURL falls back to the application pool. That is only
// correct where the two roles are the same, which in practice means a test
// database; in production it will fail loudly on the first DDL statement,
// which is the right way for a misconfiguration this important to surface.
func (s *Store) Migrate(ctx context.Context, migrationURL string) error {
	var db *sql.DB
	if migrationURL == "" {
		// goose speaks database/sql, so borrow a *sql.DB backed by the same
		// pgx pool rather than opening a second connection path.
		db = stdlib.OpenDBFromPool(s.pool)
	} else {
		var err error
		db, err = sql.Open("pgx", migrationURL)
		if err != nil {
			return fmt.Errorf("store: opening migration connection: %w", err)
		}
		if err := db.PingContext(ctx); err != nil {
			db.Close()
			return fmt.Errorf("store: connecting as the migration role: %w", err)
		}
	}
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

	// Remembered so /readyz can compare the schema this process migrated to
	// against the schema the database is actually on right now. They diverge
	// exactly once: when another instance rolls the schema forward or back
	// underneath a running container, which is the rollback runbook's worst
	// case and otherwise completely silent.
	s.schemaVersion.Store(after)

	if before == after {
		slog.Info("schema up to date", "version", after)
	} else {
		slog.Info("migrations applied", "from", before, "to", after)
	}
	return nil
}

// ExpectedSchemaVersion is the version this process migrated to at startup.
// Zero means Migrate has not run.
func (s *Store) ExpectedSchemaVersion() int64 { return s.schemaVersion.Load() }

// SchemaVersion reads the version the database is on now.
//
// Raw SQL rather than sqlc: goose owns this table and it is not in
// migrations/, so it has no generated model and should not grow one.
func (s *Store) SchemaVersion(ctx context.Context) (int64, error) {
	// max() over an empty table is NULL, not 0, so the destination has to be
	// nullable or the scan fails on a database with no migrations applied.
	var v *int64
	if err := s.pool.QueryRow(ctx,
		`SELECT max(version_id) FROM goose_db_version WHERE is_applied`,
	).Scan(&v); err != nil {
		return 0, fmt.Errorf("store: reading schema version: %w", err)
	}
	if v == nil {
		return 0, nil
	}
	return *v, nil
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
