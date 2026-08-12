package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// ErrNothingToSend is returned when a resend has no work to do: the address is
// not registered, or the account behind it is already verified.
//
// It is an error only so the caller cannot forget to handle it. The handler's
// correct response is the same 204 a successful resend gets — anything else
// turns the endpoint into an account-existence oracle (D-039).
var ErrNothingToSend = errors.New("auth: nothing to send")

// ErrEmailTaken means the address is already registered.
//
// Like ErrNothingToSend, this must not reach the client as itself. Signup
// answers identically whether or not the address was taken; this exists so the
// handler can skip sending mail, and so the log line can say what happened.
var ErrEmailTaken = errors.New("auth: email already registered")

// NewAccount is everything public signup collects.
//
// A struct rather than four positional strings: Email, Password, FirstName and
// LastName are all `string`, so a transposed pair compiles cleanly and shows
// up as an account named after its own password. The compiler cannot help with
// positional arguments here; it can with fields.
type NewAccount struct {
	Email    string
	Password string
	// FirstName is required by the handler; LastName is optional and arrives
	// as "" when it was left blank (migration 00010). Both are already
	// trimmed and length-checked by the time they get here — this package
	// stores what it is given.
	FirstName string
	LastName  string
}

// Signup creates an unverified account and mints its verification token.
//
// Everything commits together: the account, its five starter domains (D-046),
// its settings row (07 L1) and the token. A partial account is worse than no
// account — a user with no domains has an empty picker and nothing to repair
// it, and a user with no token never receives mail and can never sign in.
//
// The raw token is returned rather than stored. It exists in exactly two
// places after this call: the caller's memory, and the mailbox it is about to
// be sent to.
func (s *Service) Signup(ctx context.Context, acct NewAccount) (gen.User, string, error) {
	hash, err := Hash(acct.Password)
	if err != nil {
		return gen.User{}, "", err
	}

	// Minted here rather than defaulted by the database: the transaction has to
	// know the identity before it inserts anything, because RLS scopes the
	// starter domains by app.user_id and there is nothing to set it to until
	// the INSERT has returned (D-059).
	id := uuid.New()

	var user gen.User
	var raw string
	err = s.store.WithUserTx(ctx, id, func(q *gen.Queries) error {
		// email_verified_at stays NULL. Verification is required before the
		// account is usable: the reset link is the only recovery path there is,
		// so an unverified address is an account that can never be recovered,
		// and an unverified signup form is a free spam relay pointed at
		// whatever address an attacker types (07 L3).
		user, err = q.CreateUser(ctx, gen.CreateUserParams{
			ID:           id,
			Email:        normalizeEmail(acct.Email),
			PasswordHash: hash,
			FirstName:    acct.FirstName,
			LastName:     acct.LastName,
		})
		if err != nil {
			if isUniqueViolation(err) {
				return ErrEmailTaken
			}
			return fmt.Errorf("auth: creating user: %w", err)
		}
		if err := store.SeedDefaultDomains(ctx, q, user.ID); err != nil {
			return err
		}
		if _, err := q.CreateUserSettings(ctx, user.ID); err != nil {
			return fmt.Errorf("auth: creating user settings: %w", err)
		}

		raw, err = issueToken(ctx, q, user.ID, KindVerify, VerifyTTL)
		return err
	})
	if err != nil {
		return gen.User{}, "", err
	}
	return user, raw, nil
}

// VerifyEmail spends a verification token and marks the account verified.
//
// It deliberately does not start a session. A verification link is fetched by
// more than the person who received it — mail scanners and link-preview
// crawlers follow URLs in messages routinely — and auto-login would hand a
// session to whichever of them clicked first. Verifying and signing in are
// separate acts.
func (s *Service) VerifyEmail(ctx context.Context, rawToken string) error {
	tok, err := s.ClaimToken(ctx, rawToken, KindVerify)
	if err != nil {
		return err
	}
	if err := s.store.Q().MarkEmailVerified(ctx, tok.UserID); err != nil {
		return fmt.Errorf("auth: marking verified: %w", err)
	}
	return nil
}

// ResendVerification mints a fresh verification token for an unverified
// account.
//
// Returns ErrNothingToSend for an unknown address and for an already-verified
// one, so the handler answers identically in all three cases.
func (s *Service) ResendVerification(ctx context.Context, email string) (gen.User, string, error) {
	user, err := s.store.Q().GetUserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return gen.User{}, "", ErrNothingToSend
		}
		return gen.User{}, "", fmt.Errorf("auth: looking up user: %w", err)
	}
	if user.EmailVerifiedAt != nil {
		return gen.User{}, "", ErrNothingToSend
	}

	var raw string
	err = s.store.WithUserTx(ctx, user.ID, func(q *gen.Queries) error {
		raw, err = issueToken(ctx, q, user.ID, KindVerify, VerifyTTL)
		return err
	})
	if err != nil {
		return gen.User{}, "", err
	}
	return user, raw, nil
}

// isUniqueViolation reports whether err is Postgres 23505.
//
// Matched on the string rather than through pgconn.PgError because the error
// crosses a WithUserTx closure and arrives wrapped; seed-user already does the
// same thing for the same reason.
func isUniqueViolation(err error) bool {
	return strings.Contains(err.Error(), "23505")
}
