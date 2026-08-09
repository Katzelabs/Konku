// Package store owns all database access.
//
// Every method that touches user-owned data takes a userID and puts it in the
// WHERE clause. Ownership is never checked after the fact — see the note on
// scoping in this file (D-039).
package store

import (
	"context"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// maxConns caps the pool.
//
// Postgres max_connections defaults to 100 and Konku runs against a *shared*
// instance alongside other projects. Go's database/sql and pgxpool both
// default to a pool far larger than this app needs, and an uncapped pool means
// one misbehaving app can exhaust every connection slot on the box and take
// down every other project with it (D-028).
//
// Konku serves one user. Ten is already generous.
const maxConns = 10

// maxConnLifetime recycles connections so a long-lived process does not pin
// backends forever — relevant on a shared instance where another project may
// need the slot.
const maxConnLifetime = 5 * time.Minute

type Store struct {
	pool *pgxpool.Pool
	q    *gen.Queries

	// schemaVersion is the version Migrate settled on, read by /readyz.
	// Atomic because readiness is served concurrently with startup in tests.
	schemaVersion atomic.Int64
}

// Q returns the generated queries bound to the pool.
//
// Handlers use these directly rather than through hand-written passthrough
// wrappers. Every query in internal/store/queries carries user_id in its WHERE
// clause, so the generated params structs cannot be constructed without an
// owner — the tenancy rule is enforced by the SQL, not by a layer of
// boilerplate that could forget it (D-039).
func (s *Store) Q() *gen.Queries { return s.q }

// WithTx runs fn inside a transaction, rolling back on error or panic.
//
// The card-sync path (C3) depends on this: a note saved with its cards only
// half-synced is a corrupt state with no obvious repair path.
func (s *Store) WithTx(ctx context.Context, fn func(*gen.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("store: begin: %w", err)
	}

	defer func() {
		// Rollback after a successful Commit is a no-op, so this is safe as an
		// unconditional cleanup and survives a panic in fn.
		_ = tx.Rollback(ctx)
	}()

	if err := fn(s.q.WithTx(tx)); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("store: commit: %w", err)
	}
	return nil
}

// WithUserTx runs fn in a transaction scoped to one user's rows by RLS.
//
// This is the mechanism behind every policy in migration 00006 (D-059).
// Postgres evaluates `current_setting('app.user_id')` per statement, and
// SET LOCAL is transaction-scoped, so a user-scoped query has to run inside a
// transaction — which is why almost every read in this application moved into
// one. That cost was stated up front and paid deliberately: the alternative is
// trusting that nobody, ever, writes one of ~70 queries without its WHERE
// clause.
//
// The application predicate stays in the SQL regardless. RLS backs it up; it
// does not replace it (hard rule 9).
func (s *Store) WithUserTx(ctx context.Context, userID uuid.UUID, fn func(*gen.Queries) error) error {
	if userID == uuid.Nil {
		// Fail loudly rather than opening a transaction that can see nothing
		// and reporting it as an empty result set.
		return fmt.Errorf("store: WithUserTx called with the nil user id")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("store: begin: %w", err)
	}
	defer func() {
		// Rollback after a successful Commit is a no-op, so this is safe as
		// unconditional cleanup and survives a panic in fn.
		_ = tx.Rollback(ctx)
	}()

	// SET LOCAL does not accept bind parameters — `SET LOCAL app.user_id = $1`
	// is a syntax error. set_config with local=true is the parameterised
	// equivalent, and taking a parameter is what keeps this off the string
	// concatenation path.
	if _, err := tx.Exec(ctx,
		"select set_config('app.user_id', $1, true)", userID.String(),
	); err != nil {
		return fmt.Errorf("store: setting app.user_id: %w", err)
	}

	// fn's error is returned unwrapped: callers match on pgx.ErrNoRows to turn
	// a missing row into a 404, and wrapping here would break every one.
	if err := fn(s.q.WithTx(tx)); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("store: commit: %w", err)
	}
	return nil
}

// UserQuery is WithUserTx for the common case: one query returning one value.
//
// A package-level function because Go does not allow type parameters on
// methods. Without it every single-query handler would grow a four-line
// closure and a pre-declared variable, which is a lot of noise across the
// roughly fifty call sites this change touches.
func UserQuery[T any](ctx context.Context, s *Store, userID uuid.UUID, fn func(*gen.Queries) (T, error)) (T, error) {
	var out T
	err := s.WithUserTx(ctx, userID, func(q *gen.Queries) error {
		var err error
		out, err = fn(q)
		return err
	})
	if err != nil {
		// Return the zero value rather than a half-populated one: fn may have
		// assigned before failing, and a committed-looking value from a rolled
		// back transaction is the worst kind of bug to chase.
		var zero T
		return zero, err
	}
	return out, nil
}

// Open parses the connection string, applies the pool caps, and verifies the
// database is actually reachable before returning.
func Open(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("store: parsing DATABASE_URL: %w", err)
	}

	cfg.MaxConns = maxConns
	cfg.MaxConnLifetime = maxConnLifetime
	cfg.MaxConnIdleTime = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("store: creating pool: %w", err)
	}

	// Fail at startup rather than on the first request.
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("store: connecting to database: %w", err)
	}

	return &Store{pool: pool, q: gen.New(pool)}, nil
}

func (s *Store) Close() { s.pool.Close() }

// Ping reports whether the database is reachable, for the health endpoint.
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// Pool exposes the underlying pool for the generated sqlc queries (F2/F3).
func (s *Store) Pool() *pgxpool.Pool { return s.pool }
