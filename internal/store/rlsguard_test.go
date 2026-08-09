package store_test

import (
	"context"
	"os"
	"testing"

	"github.com/Katzelabs/Konku/internal/store"
)

// migrationURL is the owner connection used for DDL.
//
// The application pool connects as konku_app, which deliberately has no DDL
// rights, so migrations need a different principal (D-059). Empty falls back
// to the application pool, which is only correct where the two roles are the
// same.
func migrationURL() string { return os.Getenv("TEST_MIGRATION_DATABASE_URL") }

// requireRLSEnforcedRole fails the test if the connection can bypass RLS.
//
// This is the guard against the failure D-059 describes one level deeper.
// FORCE ROW LEVEL SECURITY does not apply to a SUPERUSER or a BYPASSRLS role,
// and the dev database's `konku` is both — it is the bootstrap user the
// Postgres image creates. Connect the tests as that role and every policy is
// inert, every tenancy test passes, and the suite certifies a protection that
// does not exist.
//
// So this does not skip and does not warn. It fails, loudly, with the fix.
func requireRLSEnforcedRole(t *testing.T, st *store.Store) {
	t.Helper()

	var name string
	var super, bypass bool
	err := st.Pool().QueryRow(context.Background(),
		`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
	).Scan(&name, &super, &bypass)
	if err != nil {
		t.Fatalf("reading the current role: %v", err)
	}

	if super || bypass {
		t.Fatalf(`tests are connected as %q (superuser=%v, bypassrls=%v).

Row-level security is INERT for this role: FORCE ROW LEVEL SECURITY does not
apply to superusers or BYPASSRLS roles, so every tenancy test below would pass
without proving anything at all.

Fix: run `+"`make db-app-role`"+` and point TEST_DATABASE_URL at konku_app.`,
			name, super, bypass)
	}
}

// The guard itself has to be exercised, or it is one more thing that is
// assumed to work. This asserts the test connection really is the app role and
// that policies really are forced on a table that has them.
func TestTestConnectionCannotBypassRLS(t *testing.T) {
	st, ctx := newStore(t)
	requireRLSEnforcedRole(t, st)

	var enabled, forced bool
	if err := st.Pool().QueryRow(ctx,
		`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'notes'`,
	).Scan(&enabled, &forced); err != nil {
		t.Fatalf("reading notes RLS flags: %v", err)
	}
	if !enabled {
		t.Error("notes does not have row level security enabled")
	}
	if !forced {
		t.Error("notes does not have FORCE ROW LEVEL SECURITY; every policy on " +
			"it is inert for the table owner")
	}
}

// Every table that carries a user_id must have RLS enabled, forced, and a
// policy — checked as a schema invariant rather than a list somebody maintains.
//
// This is what catches the dangerous case: a future migration adds a table with
// a user_id and grants the app access, and nobody remembers the policy. There
// is deliberately no ALTER DEFAULT PRIVILEGES for exactly this reason, and this
// test is the other half of that decision.
func TestEveryUserTableIsProtected(t *testing.T) {
	st, ctx := newStore(t)

	rows, err := st.Pool().Query(ctx, `
		SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
		       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public'
		  AND c.relkind = 'r'
		  AND EXISTS (
		        SELECT 1 FROM information_schema.columns col
		        WHERE col.table_schema = 'public'
		          AND col.table_name = c.relname
		          AND col.column_name = 'user_id')
		ORDER BY c.relname`)
	if err != nil {
		t.Fatalf("listing user tables: %v", err)
	}
	defer rows.Close()

	seen := 0
	for rows.Next() {
		var name string
		var enabled, forced bool
		var policies int
		if err := rows.Scan(&name, &enabled, &forced, &policies); err != nil {
			t.Fatalf("scanning: %v", err)
		}
		seen++
		if !enabled {
			t.Errorf("%s carries user_id but has no row level security", name)
		}
		if !forced {
			t.Errorf("%s has row level security but not FORCE — the policy is "+
				"inert for the table owner", name)
		}
		if policies == 0 {
			t.Errorf("%s has row level security enabled but no policy, which "+
				"denies everything rather than scoping it", name)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterating: %v", err)
	}

	// A sanity floor: if the query silently matched nothing, the invariant
	// above would pass vacuously.
	if seen < 14 {
		t.Errorf("only %d tables with user_id were checked; the schema has more, "+
			"so this query is not seeing what it claims to", seen)
	}
}
