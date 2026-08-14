package auth

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// DeleteAccount removes the account and everything it owns (07 L7).
//
// Not soft, and there is no tombstone. Every other delete in this product is
// recoverable on purpose — a note or a card that vanishes silently is the
// failure the whole thing exists to prevent — and this is the one place where
// that instinct is wrong. An account that can be brought back is an account
// that was not deleted, and "we kept a copy" is the opposite of what someone
// asking for deletion is asking for.
//
// One statement, because all sixteen tables carrying user_id reference
// users(id) ON DELETE CASCADE. Deleting each table by hand would be a list
// someone forgets to add to, and the failure mode is orphaned rows nobody
// looks at again. The cascade is declared next to the data it protects.
//
// Requires the password. The session alone is not enough authority for an
// irreversible action: a borrowed laptop or a stolen cookie should be able to
// read notes, not to destroy the account. This is the only place in the app
// that re-authenticates, and it is the only place that needs to.
func (s *Service) DeleteAccount(ctx context.Context, userID uuid.UUID, password string) error {
	// Scoped, like the delete below. The users policy permits when app.user_id
	// is unset — the auth path needs that branch to resolve a session at all —
	// but this call is not on the auth path: the caller is already identified,
	// so there is no reason to spend it here (hard rule 9).
	user, err := store.UserQuery(ctx, s.store, userID, func(q *gen.Queries) (gen.User, error) {
		return q.GetUserByID(ctx, userID)
	})
	if err != nil {
		return fmt.Errorf("auth: looking up account: %w", err)
	}

	// Deliberately between the two transactions rather than inside either.
	//
	// Verify is ~100ms of argon2 and may additionally block on the hashing
	// semaphore, and the pool holds ten connections for the sake of every other
	// project on the box (D-028). Doing this inside the transaction above would
	// pin a connection for the whole of it — turning the one endpoint designed
	// to be slow into a way to exhaust the pool, which is the failure the rate
	// limit on this route exists to prevent.
	ok, err := Verify(user.PasswordHash, password)
	if err != nil {
		return fmt.Errorf("auth: verifying password: %w", err)
	}
	if !ok {
		return ErrInvalidCredentials
	}

	// Scoped like everything else (hard rule 4), and inside a user transaction
	// so RLS applies to the delete as well as to the read.
	return s.store.WithUserTx(ctx, userID, func(q *gen.Queries) error {
		if err := q.DeleteUser(ctx, userID); err != nil {
			return fmt.Errorf("auth: deleting account: %w", err)
		}
		return nil
	})
}
