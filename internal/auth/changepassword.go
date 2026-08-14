package auth

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// ChangePassword replaces a signed-in account's password.
//
// The other half of ResetPassword, and deliberately built from the same pieces
// without the token. Reset proves control of the mailbox because the person has
// lost the password; this proves control of the password because they still
// have it. Both end with a new hash and fewer live sessions.
//
// **It exists because the reset round trip is not a substitute.** Until now the
// only way to a new password was the forgot-password mail, which means someone
// who merely suspects their password is compromised has to go via their inbox
// to fix it — and an instance with no SMTP configured could not do it at all,
// which is every instance where ALLOW_SIGNUP is false and the one account came
// from `konku seed-user`.
//
// Three differences from ResetPassword, each deliberate:
//
//  1. the current password is required. A session is authority to read and
//     write notes; it is not authority to change the credential that outlives
//     it. Same reasoning as DeleteAccount, and the same borrowed-laptop case
//  2. **every other session is revoked, and this one is kept.** Reset kills all
//     of them because the person is not holding a session it would be safe to
//     trust. Here they are, and signing them out of the screen they just used
//     reads as a bug rather than as the feature working
//  3. nothing is marked verified. Clicking a link in a mailbox proves something
//     about the address; typing a password does not, and quietly verifying an
//     account here would make the verification gate mean less than it says
func (s *Service) ChangePassword(ctx context.Context, userID uuid.UUID, current, next, currentSessionID string) error {
	// Scoped, like every read that runs after the caller is identified. The
	// users policy permits when app.user_id is unset, but this is not the auth
	// path — the caller is already known (hard rule 9).
	user, err := store.UserQuery(ctx, s.store, userID, func(q *gen.Queries) (gen.User, error) {
		return q.GetUserByID(ctx, userID)
	})
	if err != nil {
		return fmt.Errorf("auth: looking up account: %w", err)
	}

	// Both hashes happen outside a transaction, for the reason DeleteAccount
	// spells out: argon2 is ~100ms and may queue on the hashing semaphore, and
	// holding one of ten pool connections across that is how a slow endpoint
	// becomes a way to exhaust the pool (D-028).
	ok, err := Verify(user.PasswordHash, current)
	if err != nil {
		return fmt.Errorf("auth: verifying password: %w", err)
	}
	if !ok {
		return ErrInvalidCredentials
	}

	hash, err := Hash(next)
	if err != nil {
		return err
	}

	// One transaction. A new password that did not revoke the other sessions
	// would leave whoever the change was aimed at still signed in, which is
	// most of the point; the reverse — sessions gone, password unchanged —
	// signs the user out of their own devices for nothing.
	return s.store.WithUserTx(ctx, userID, func(q *gen.Queries) error {
		if err := q.UpdatePassword(ctx, gen.UpdatePasswordParams{
			ID:           userID,
			PasswordHash: hash,
		}); err != nil {
			return fmt.Errorf("auth: updating password: %w", err)
		}
		if err := q.DeleteOtherSessionsForUser(ctx, gen.DeleteOtherSessionsForUserParams{
			UserID: userID, ID: currentSessionID,
		}); err != nil {
			return fmt.Errorf("auth: revoking other sessions: %w", err)
		}
		return nil
	})
}
