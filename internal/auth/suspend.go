package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// ErrNoAccount is an address that matches no account.
//
// Deliberately carries no address of its own. It is returned to a CLI whose
// caller logs errors through slog, and an email in an error string is an email
// in a log line (hard rule 10, D-062). The operator typed the address; they do
// not need it read back to them.
var ErrNoAccount = errors.New("auth: no account with that email address")

// Suspend stops an account and signs it out (ticket 10, O1).
//
// Two things happen, in this order and deliberately not in one transaction:
//
//  1. users.suspended_at is set. This is what every request is checked
//     against — Resolve reads the users row on the way past, so the gate in
//     requireNotSuspended is true the instant this commits.
//  2. Every live session for the account is deleted, so an open tab stops
//     working now rather than on its next full page load.
//
// Not one transaction, because they are not equally important and pretending
// otherwise makes the wrong one win. If (2) fails, the account is still
// suspended and still blocked on every request; rolling (1) back to keep the
// pair atomic would leave a suspension the operator believes happened and did
// not. The caller reports the failure and the account stays stopped. That is
// hard rule 9 doing its job rather than a gap in it: the enforcement does not
// depend on the revocation having worked.
//
// Idempotent. Suspending an already-suspended account keeps the original
// timestamp and returns it, so re-running the command during an incident is
// safe and still answers "since when".
func (s *Service) Suspend(ctx context.Context, email string) (uuid.UUID, time.Time, error) {
	row, err := s.store.Q().SuspendUser(ctx, normalizeEmail(email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, time.Time{}, ErrNoAccount
		}
		return uuid.Nil, time.Time{}, fmt.Errorf("auth: suspending account: %w", err)
	}
	if row.SuspendedAt == nil {
		// Unreachable: the statement writes coalesce(suspended_at, now()), so
		// a returned row always has one. Stated rather than dereferenced on
		// faith, because the alternative is a nil panic in an operator command
		// run during an incident.
		return uuid.Nil, time.Time{}, errors.New("auth: suspended account came back with no timestamp")
	}

	// Scoped, and scoped because the identity is known by this line — the same
	// rule the sessions screen follows (see session.go). The WHERE clause and
	// the RLS policy both name the account.
	if err := s.store.WithUserTx(ctx, row.ID, func(q *gen.Queries) error {
		return q.DeleteSessionsForUser(ctx, row.ID)
	}); err != nil {
		return row.ID, *row.SuspendedAt, fmt.Errorf("auth: revoking sessions of a suspended account: %w", err)
	}

	return row.ID, *row.SuspendedAt, nil
}

// Unsuspend puts an account back, and is the reason the mechanism is usable.
//
// It does not restore sessions — nothing could, they are gone — so the person
// signs in again. That is the correct outcome: a suspension lifted is an
// account handed back to its owner, not a browser tab resumed mid-request.
//
// Idempotent for the same reason Suspend is: an account that was not suspended
// is left active rather than treated as an error.
func (s *Service) Unsuspend(ctx context.Context, email string) (uuid.UUID, error) {
	row, err := s.store.Q().UnsuspendUser(ctx, normalizeEmail(email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrNoAccount
		}
		return uuid.Nil, fmt.Errorf("auth: unsuspending account: %w", err)
	}
	return row.ID, nil
}
