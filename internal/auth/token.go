package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Token kinds, matching the CHECK constraint on auth_tokens.kind.
const (
	KindVerify = "verify"
	KindReset  = "reset"
)

// Token lifetimes.
//
// Verification is long because the mail may sit unread overnight and a expired
// link is a support request. Reset is short because it is the more dangerous of
// the two: it is a live credential for an account someone may already be
// attacking (07 L4).
const (
	VerifyTTL = 24 * time.Hour
	ResetTTL  = time.Hour
)

// ErrInvalidToken covers every way a token can fail to claim: unknown, wrong
// kind, already used, expired.
//
// One error for all four, deliberately. The client must not be able to tell an
// expired link from a spent one from a forged one — the same reasoning as
// ErrInvalidCredentials and as the not-found rule (D-039).
var ErrInvalidToken = errors.New("auth: invalid token")

// newToken returns a fresh token and the hash to store for it.
//
// 256 bits of CSPRNG output, base64url so it survives a query string, hashed
// with SHA-256 rather than argon2id. That is not a shortcut: the token has no
// guessable structure, so there is no search space to slow an attacker down
// against, and argon2 would cost every click ~100ms to defend nothing.
// Password hashing is slow because passwords are weak.
func newToken() (raw, hash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("auth: generating token: %w", err)
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	return raw, hashToken(raw), nil
}

// hashToken is the one place a raw token becomes the stored form. A plain
// comparison of two SHA-256 digests is not a timing risk: the attacker would
// have to guess the preimage, and the digest is not the secret.
func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// issueToken mints a token for a user inside an existing transaction.
//
// It takes a *gen.Queries rather than reaching for the pool so signup can
// commit the account, its domains, its settings and its verification token
// together. A user created without a token is a user who never gets mail.
func issueToken(ctx context.Context, q *gen.Queries, userID uuid.UUID, kind string, ttl time.Duration) (string, error) {
	raw, hash, err := newToken()
	if err != nil {
		return "", err
	}
	if _, err := q.CreateAuthToken(ctx, gen.CreateAuthTokenParams{
		UserID:    userID,
		Kind:      kind,
		TokenHash: hash,
		ExpiresAt: time.Now().Add(ttl),
	}); err != nil {
		return "", fmt.Errorf("auth: creating %s token: %w", kind, err)
	}
	return raw, nil
}

// ClaimToken spends a token outside a transaction and returns the account it
// belonged to.
//
// Callers that must do more work atomically with the claim use claimToken
// inside their own transaction instead — the reset path does, so that a failure
// while writing the new password un-spends the link rather than stranding the
// user with a dead one.
func (s *Service) ClaimToken(ctx context.Context, raw, kind string) (gen.AuthToken, error) {
	return claimToken(ctx, s.store.Q(), raw, kind)
}

// claimToken is the claim itself, against whichever *gen.Queries it is given.
//
// Claiming is a single UPDATE, so two concurrent clicks cannot both succeed:
// the row is locked by the first, and the second finds used_at already set.
func claimToken(ctx context.Context, q *gen.Queries, raw, kind string) (gen.AuthToken, error) {
	if raw == "" {
		return gen.AuthToken{}, ErrInvalidToken
	}

	tok, err := q.ClaimAuthToken(ctx, gen.ClaimAuthTokenParams{
		TokenHash: hashToken(raw),
		Kind:      kind,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return gen.AuthToken{}, ErrInvalidToken
		}
		return gen.AuthToken{}, fmt.Errorf("auth: claiming token: %w", err)
	}
	return tok, nil
}

// PurgeExpiredTokens clears spent and expired tokens. Called opportunistically
// alongside the session purge rather than from a cron job.
func (s *Service) PurgeExpiredTokens(ctx context.Context) error {
	return s.store.Q().DeleteExpiredAuthTokens(ctx)
}
