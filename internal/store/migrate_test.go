package store_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/Katzelabs/Konku/migrations"
)

// Migration tests (P7).
//
// Migrations run at startup and a failure is fatal (D-061), so a migration
// that only works against the schema on the author's laptop takes the service
// down on deploy rather than failing in review. Two properties matter:
//
//  1. the whole chain applies to an empty database
//  2. each step applies to the schema of the step before it — which is what a
//     deploy actually does, and is not the same test
//
// Every case runs in its own scratch database, created and dropped here, so a
// failure cannot leave the dev database half-migrated.

// ownerURL is the connection able to CREATE DATABASE. The application role
// deliberately cannot (D-059).
func ownerURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv("TEST_MIGRATION_DATABASE_URL")
	if url == "" {
		url = os.Getenv("TEST_DATABASE_URL")
	}
	if url == "" {
		t.Skip("TEST_MIGRATION_DATABASE_URL not set; run `make test-integration`")
	}
	return url
}

// withScratchDB creates an empty database, hands back a connection to it, and
// drops it afterwards whatever happens.
func withScratchDB(t *testing.T, name string) *sql.DB {
	t.Helper()
	ctx := context.Background()
	url := ownerURL(t)

	admin, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatalf("opening admin connection: %v", err)
	}
	t.Cleanup(func() { admin.Close() })

	drop := func() {
		// Terminate stragglers first: DROP DATABASE fails while any session
		// is still attached, and a failed drop leaks a database per run.
		_, _ = admin.ExecContext(ctx,
			`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
			  WHERE datname = $1 AND pid <> pg_backend_pid()`, name)
		if _, err := admin.ExecContext(ctx,
			fmt.Sprintf(`DROP DATABASE IF EXISTS %q`, name)); err != nil {
			t.Logf("dropping scratch database %s: %v", name, err)
		}
	}
	drop() // in case a previous run died before its cleanup

	if _, err := admin.ExecContext(ctx, fmt.Sprintf(`CREATE DATABASE %q`, name)); err != nil {
		t.Fatalf("creating scratch database: %v", err)
	}
	t.Cleanup(drop)

	db, err := sql.Open("pgx", swapDatabase(url, name))
	if err != nil {
		drop()
		t.Fatalf("connecting to scratch database: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("pinging scratch database: %v", err)
	}
	return db
}

// swapDatabase rewrites the database name in a postgres URL, keeping the
// credentials, host and query string.
func swapDatabase(url, name string) string {
	rest, query, hasQuery := strings.Cut(url, "?")
	slash := strings.LastIndex(rest, "/")
	out := rest[:slash+1] + name
	if hasQuery {
		out += "?" + query
	}
	return out
}

func gooseSetup(t *testing.T) {
	t.Helper()
	goose.SetBaseFS(migrations.FS)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("goose dialect: %v", err)
	}
}

// The whole chain against an empty database: the fresh-clone and
// disaster-recovery path.
func TestMigrationsApplyToAnEmptyDatabase(t *testing.T) {
	db := withScratchDB(t, "konku_migtest_empty")
	gooseSetup(t)
	ctx := context.Background()

	if err := goose.UpContext(ctx, db, "."); err != nil {
		t.Fatalf("applying migrations to an empty database: %v", err)
	}

	version, err := goose.GetDBVersionContext(ctx, db)
	if err != nil {
		t.Fatalf("reading version: %v", err)
	}
	if version == 0 {
		t.Fatal("no migrations were applied")
	}

	// The schema is not merely present — it is the one the application
	// expects, with row security actually on (D-059).
	var protected int
	if err := db.QueryRowContext(ctx, `
		SELECT count(*) FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind = 'r'
		  AND c.relrowsecurity AND c.relforcerowsecurity`).Scan(&protected); err != nil {
		t.Fatalf("counting protected tables: %v", err)
	}
	if protected < 14 {
		t.Errorf("only %d tables have FORCE row security on a fresh database; "+
			"a new install would ship without tenancy enforcement", protected)
	}
}

// Each migration applied on top of the one before it — which is what a deploy
// does. A migration can pass the empty-database test and still fail here, by
// assuming a column that an earlier migration dropped or a table that a later
// one creates.
func TestEachMigrationAppliesToThePreviousSchema(t *testing.T) {
	db := withScratchDB(t, "konku_migtest_stepwise")
	gooseSetup(t)
	ctx := context.Background()

	collected, err := goose.CollectMigrations(".", 0, goose.MaxVersion)
	if err != nil {
		t.Fatalf("collecting migrations: %v", err)
	}
	if len(collected) < 6 {
		t.Fatalf("collected only %d migrations; the embed is not seeing them all",
			len(collected))
	}

	for _, m := range collected {
		t.Run(fmt.Sprintf("v%d", m.Version), func(t *testing.T) {
			if err := goose.UpToContext(ctx, db, ".", m.Version); err != nil {
				t.Fatalf("applying %d on top of the previous schema: %v", m.Version, err)
			}
			got, err := goose.GetDBVersionContext(ctx, db)
			if err != nil {
				t.Fatalf("reading version: %v", err)
			}
			if got != m.Version {
				t.Fatalf("version after applying = %d, want %d", got, m.Version)
			}
		})
	}
}

// Down has to work too, or rollback.md is fiction (D-064). This is the case
// the runbook hits at its worst: a bad release that also migrated.
func TestTheLastMigrationRollsBackAndReapplies(t *testing.T) {
	db := withScratchDB(t, "konku_migtest_rollback")
	gooseSetup(t)
	ctx := context.Background()

	if err := goose.UpContext(ctx, db, "."); err != nil {
		t.Fatalf("applying migrations: %v", err)
	}
	top, err := goose.GetDBVersionContext(ctx, db)
	if err != nil {
		t.Fatalf("reading version: %v", err)
	}

	if err := goose.DownContext(ctx, db, "."); err != nil {
		t.Fatalf("rolling back %d: %v", top, err)
	}
	after, err := goose.GetDBVersionContext(ctx, db)
	if err != nil {
		t.Fatalf("reading version after down: %v", err)
	}
	if after >= top {
		t.Fatalf("version after down = %d, want below %d", after, top)
	}

	// And forward again, because a rollback you cannot undo is a one-way door.
	if err := goose.UpContext(ctx, db, "."); err != nil {
		t.Fatalf("re-applying after rollback: %v", err)
	}
	final, err := goose.GetDBVersionContext(ctx, db)
	if err != nil {
		t.Fatalf("reading final version: %v", err)
	}
	if final != top {
		t.Fatalf("version after re-applying = %d, want %d", final, top)
	}
}
