// Package store owns all database access.
//
// Every method that touches user-owned data takes a userID and puts it in the
// WHERE clause. Ownership is never checked after the fact — see the note on
// scoping in this file (D-039).
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
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

	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

// Ping reports whether the database is reachable, for the health endpoint.
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// Pool exposes the underlying pool for the generated sqlc queries (F2/F3).
func (s *Store) Pool() *pgxpool.Pool { return s.pool }
