package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Emptying Terhapus.
//
// The rule this file exists to pin down: a card that was ever studied is never
// purged, whatever the window says. review_logs and review_run_cards have no
// foreign key to cards on purpose (D-050), so nothing in the database would
// stop a purge from orphaning them — only this predicate does.

// purgeFixture is one account with a deleted note, a deleted card nobody ever
// studied, and a deleted card with review history.
type purgeFixture struct {
	userID      uuid.UUID
	freshNote   uuid.UUID
	staleNote   uuid.UUID
	staleCard   uuid.UUID
	studiedCard uuid.UUID
	liveNote    uuid.UUID
}

func seedPurgeFixture(t *testing.T, st *store.Store, ctx context.Context) purgeFixture {
	t.Helper()

	f := purgeFixture{userID: uuid.New()}
	long := time.Now().Add(-40 * 24 * time.Hour)
	recent := time.Now().Add(-2 * 24 * time.Hour)

	err := st.WithUserTx(ctx, f.userID, func(q *gen.Queries) error {
		if _, err := q.CreateUser(ctx, gen.CreateUserParams{
			ID:           f.userID,
			Email:        "purge-" + f.userID.String() + "@example.com",
			PasswordHash: "x",
		}); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		t.Fatalf("creating the account: %v", err)
	}
	t.Cleanup(func() {
		_, _ = st.Pool().Exec(context.Background(), "DELETE FROM users WHERE id = $1", f.userID)
	})

	exec := func(sql string, args ...any) {
		t.Helper()
		if err := runScoped(t, st, ctx, f.userID, sql, args...); err != nil {
			t.Fatalf("seeding: %v", err)
		}
	}

	f.liveNote, f.freshNote, f.staleNote = uuid.New(), uuid.New(), uuid.New()
	exec(`INSERT INTO notes (id, user_id, title, content_md) VALUES ($1,$2,'hidup','')`, f.liveNote, f.userID)
	exec(`INSERT INTO notes (id, user_id, title, content_md, deleted_at) VALUES ($1,$2,'baru dihapus','',$3)`,
		f.freshNote, f.userID, recent)
	exec(`INSERT INTO notes (id, user_id, title, content_md, deleted_at) VALUES ($1,$2,'lama dihapus','',$3)`,
		f.staleNote, f.userID, long)

	f.staleCard, f.studiedCard = uuid.New(), uuid.New()
	exec(`INSERT INTO cards (id, user_id, type, front, back, deleted_at) VALUES ($1,$2,'basic','f','b',$3)`,
		f.staleCard, f.userID, long)
	exec(`INSERT INTO cards (id, user_id, type, front, back, deleted_at) VALUES ($1,$2,'basic','f','b',$3)`,
		f.studiedCard, f.userID, long)
	// The one thing that must protect a card from the purge.
	exec(`INSERT INTO review_logs (user_id, card_id, rating, source) VALUES ($1,$2,'ingat','due')`,
		f.userID, f.studiedCard)

	return f
}

// runScoped executes a statement inside a transaction with app.user_id set,
// which is the only way a write to an RLS-protected table lands.
func runScoped(t *testing.T, st *store.Store, ctx context.Context, userID uuid.UUID, sql string, args ...any) error {
	t.Helper()

	tx, err := st.Pool().Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "select set_config('app.user_id', $1, true)", userID.String()); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, sql, args...); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func countScoped(t *testing.T, st *store.Store, ctx context.Context, userID uuid.UUID, sql string, args ...any) int {
	t.Helper()

	tx, err := st.Pool().Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "select set_config('app.user_id', $1, true)", userID.String()); err != nil {
		t.Fatalf("scoping: %v", err)
	}
	var n int
	if err := tx.QueryRow(ctx, sql, args...).Scan(&n); err != nil {
		t.Fatalf("counting: %v", err)
	}
	return n
}

func TestPurgeRemovesOnlyWhatIsPastTheWindow(t *testing.T) {
	st, ctx := newStore(t)
	requireRLSEnforcedRole(t, st)
	f := seedPurgeFixture(t, st, ctx)

	if _, err := st.PurgeTrash(ctx, store.TrashWindow); err != nil {
		t.Fatalf("PurgeTrash: %v", err)
	}

	cases := []struct {
		name string
		id   uuid.UUID
		want int
	}{
		{"a live note is untouched", f.liveNote, 1},
		{"a recently deleted note is still recoverable", f.freshNote, 1},
		{"a note deleted past the window is gone", f.staleNote, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := countScoped(t, st, ctx, f.userID,
				"SELECT count(*) FROM notes WHERE id = $1", tc.id)
			if got != tc.want {
				t.Errorf("%d row(s), want %d", got, tc.want)
			}
		})
	}
}

// The rule worth protecting: history is the part of a card that matters.
func TestPurgeKeepsAnyCardThatWasEverStudied(t *testing.T) {
	st, ctx := newStore(t)
	requireRLSEnforcedRole(t, st)
	f := seedPurgeFixture(t, st, ctx)

	if _, err := st.PurgeTrash(ctx, store.TrashWindow); err != nil {
		t.Fatalf("PurgeTrash: %v", err)
	}

	if got := countScoped(t, st, ctx, f.userID,
		"SELECT count(*) FROM cards WHERE id = $1", f.staleCard); got != 0 {
		t.Errorf("an unstudied card deleted past the window survived (%d rows)", got)
	}
	if got := countScoped(t, st, ctx, f.userID,
		"SELECT count(*) FROM cards WHERE id = $1", f.studiedCard); got != 1 {
		t.Errorf("a card with review history was purged (%d rows) — review_logs has "+
			"no foreign key to cards (D-050), so nothing else would have stopped it", got)
	}
	// And its history is intact, which is the reason the card was kept.
	if got := countScoped(t, st, ctx, f.userID,
		"SELECT count(*) FROM review_logs WHERE card_id = $1", f.studiedCard); got != 1 {
		t.Errorf("the review history went with it (%d rows)", got)
	}
}

// The purge reports what it did, because the log line is the only evidence the
// job is running at all.
func TestPurgeReportsWhatItRemoved(t *testing.T) {
	st, ctx := newStore(t)
	requireRLSEnforcedRole(t, st)
	f := seedPurgeFixture(t, st, ctx)

	result, err := st.PurgeTrash(ctx, store.TrashWindow)
	if err != nil {
		t.Fatalf("PurgeTrash: %v", err)
	}
	if result.Notes < 1 {
		t.Errorf("Notes = %d, want at least the one stale note", result.Notes)
	}
	if result.Cards < 1 {
		t.Errorf("Cards = %d, want at least the one unstudied stale card", result.Cards)
	}
	if result.Accounts < 1 {
		t.Errorf("Accounts = %d, want at least this one", result.Accounts)
	}

	// A second run finds nothing, which is what makes a daily job harmless.
	again, err := st.PurgeTrash(ctx, store.TrashWindow)
	if err != nil {
		t.Fatalf("second PurgeTrash: %v", err)
	}
	if again.Notes != 0 || again.Cards != 0 {
		t.Errorf("a second run removed %d notes and %d cards; the first did not finish",
			again.Notes, again.Cards)
	}
	_ = f
}

// One account's trash is not another's. The purge is the widest delete in the
// application, so a scoping mistake here is the largest one available.
func TestPurgeDoesNotCrossAccounts(t *testing.T) {
	st, ctx := newStore(t)
	requireRLSEnforcedRole(t, st)

	a := seedPurgeFixture(t, st, ctx)
	b := seedPurgeFixture(t, st, ctx)

	// B's stale note is younger than the window, so it must survive a purge
	// that removes A's.
	if err := runScoped(t, st, ctx, b.userID,
		`UPDATE notes SET deleted_at = $2 WHERE id = $1`,
		b.staleNote, time.Now().Add(-1*time.Hour)); err != nil {
		t.Fatalf("adjusting B's note: %v", err)
	}

	if _, err := st.PurgeTrash(ctx, store.TrashWindow); err != nil {
		t.Fatalf("PurgeTrash: %v", err)
	}

	if got := countScoped(t, st, ctx, a.userID,
		"SELECT count(*) FROM notes WHERE id = $1", a.staleNote); got != 0 {
		t.Errorf("A's stale note survived (%d rows)", got)
	}
	if got := countScoped(t, st, ctx, b.userID,
		"SELECT count(*) FROM notes WHERE id = $1", b.staleNote); got != 1 {
		t.Errorf("B's recent note was purged by A's sweep (%d rows)", got)
	}
}
