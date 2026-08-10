package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// RequestPasswordReset mints a reset token for an address.
//
// Returns ErrNothingToSend for an address that is not registered or whose
// account is pending deletion, so the handler can answer the same 204 in every
// case. The endpoint must not reveal which addresses have accounts — the same
// reasoning as the not-found rule and as signup (D-039).
//
// Deliberately available to an *unverified* account too. Reset is a recovery
// path, and refusing it to the accounts most likely to be stuck — someone who
// mistyped a password and never received the verification mail — would make
// the product less recoverable in the name of a purity that buys nothing: both
// links prove the same thing, control of the mailbox.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) (gen.User, string, error) {
	user, err := s.store.Q().GetUserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return gen.User{}, "", ErrNothingToSend
		}
		return gen.User{}, "", fmt.Errorf("auth: looking up user: %w", err)
	}
	if user.DeletedAt != nil {
		return gen.User{}, "", ErrNothingToSend
	}

	var raw string
	err = s.store.WithUserTx(ctx, user.ID, func(q *gen.Queries) error {
		raw, err = issueToken(ctx, q, user.ID, KindReset, ResetTTL)
		return err
	})
	if err != nil {
		return gen.User{}, "", err
	}
	return user, raw, nil
}

// ResetPassword spends a reset token and installs a new password.
//
// Four things happen together or not at all:
//
//  1. the token is claimed, which is what makes it single-use and expiring
//  2. the password is replaced
//  3. **every session for the account is revoked**, including any the attacker
//     is holding. A reset is what someone does when they believe their account
//     is compromised, and one that leaves the intruder signed in does nothing
//  4. the address is marked verified, because clicking a link sent to it
//     proves exactly what the verification link proves. Leaving it unverified
//     would strand someone who has just proven they own the mailbox
//
// One transaction, so a failure part-way through un-spends the link. The
// alternative — claim first, then write — leaves a user holding a dead link
// and no new password, which is the worst of both.
func (s *Service) ResetPassword(ctx context.Context, rawToken, newPassword string) error {
	hash, err := Hash(newPassword)
	if err != nil {
		return err
	}

	return s.store.WithTx(ctx, func(q *gen.Queries) error {
		tok, err := claimToken(ctx, q, rawToken, KindReset)
		if err != nil {
			return err
		}

		if err := q.UpdatePassword(ctx, gen.UpdatePasswordParams{
			ID:           tok.UserID,
			PasswordHash: hash,
		}); err != nil {
			return fmt.Errorf("auth: updating password: %w", err)
		}
		if err := q.DeleteSessionsForUser(ctx, tok.UserID); err != nil {
			return fmt.Errorf("auth: revoking sessions: %w", err)
		}
		if err := q.MarkEmailVerified(ctx, tok.UserID); err != nil {
			return fmt.Errorf("auth: marking verified: %w", err)
		}
		return nil
	})
}
