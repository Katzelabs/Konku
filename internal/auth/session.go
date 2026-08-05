package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

var (
	// ErrInvalidCredentials covers both "no such email" and "wrong password".
	// Distinguishing them would let anyone enumerate registered addresses.
	ErrInvalidCredentials = errors.New("auth: invalid credentials")
	ErrNoSession          = errors.New("auth: no valid session")
)

type Service struct {
	store *store.Store
	ttl   time.Duration
}

func NewService(st *store.Store, ttl time.Duration) *Service {
	return &Service{store: st, ttl: ttl}
}

// NewSessionID returns a 256-bit random identifier.
//
// Sessions are opaque random strings stored server-side rather than signed
// cookies carrying claims, so logout can actually revoke one (D-039).
func NewSessionID() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("auth: generating session id: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// Login verifies credentials and starts a session.
//
// It always runs a password verification, even when the email is unknown, so
// the response time does not reveal whether an account exists.
func (s *Service) Login(ctx context.Context, email, password string) (gen.User, string, time.Time, error) {
	var zero gen.User

	user, err := s.store.Q().GetUserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Burn roughly the same CPU as a real verification would.
			_, _ = Verify(dummyHash, password)
			return zero, "", time.Time{}, ErrInvalidCredentials
		}
		return zero, "", time.Time{}, fmt.Errorf("auth: looking up user: %w", err)
	}

	ok, err := Verify(user.PasswordHash, password)
	if err != nil {
		return zero, "", time.Time{}, fmt.Errorf("auth: verifying password: %w", err)
	}
	if !ok {
		return zero, "", time.Time{}, ErrInvalidCredentials
	}

	id, err := NewSessionID()
	if err != nil {
		return zero, "", time.Time{}, err
	}
	expires := time.Now().Add(s.ttl)

	if _, err := s.store.Q().CreateSession(ctx, gen.CreateSessionParams{
		ID: id, UserID: user.ID, ExpiresAt: expires,
	}); err != nil {
		return zero, "", time.Time{}, fmt.Errorf("auth: creating session: %w", err)
	}

	return user, id, expires, nil
}

// Resolve returns the user behind a session ID.
//
// Expiry is enforced in SQL, so an expired session can never be treated as
// valid by a caller that forgot to check.
func (s *Service) Resolve(ctx context.Context, sessionID string) (gen.User, error) {
	if sessionID == "" {
		return gen.User{}, ErrNoSession
	}

	row, err := s.store.Q().GetActiveSession(ctx, sessionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return gen.User{}, ErrNoSession
		}
		return gen.User{}, fmt.Errorf("auth: resolving session: %w", err)
	}
	return row.User, nil
}

func (s *Service) Logout(ctx context.Context, sessionID string) error {
	if sessionID == "" {
		return nil
	}
	if err := s.store.Q().DeleteSession(ctx, sessionID); err != nil {
		return fmt.Errorf("auth: deleting session: %w", err)
	}
	return nil
}

// PurgeExpired clears out dead sessions. Called opportunistically on login
// rather than from a cron job — at this scale that is enough.
func (s *Service) PurgeExpired(ctx context.Context) error {
	return s.store.Q().DeleteExpiredSessions(ctx)
}

// CreateUser hashes the password and inserts the account. Used by the
// seed-user command, and by signup once ALLOW_SIGNUP exists in v0.2.
func (s *Service) CreateUser(ctx context.Context, email, password string) (gen.User, error) {
	hash, err := Hash(password)
	if err != nil {
		return gen.User{}, err
	}
	user, err := s.store.Q().CreateUser(ctx, gen.CreateUserParams{
		Email:        normalizeEmail(email),
		PasswordHash: hash,
	})
	if err != nil {
		return gen.User{}, fmt.Errorf("auth: creating user: %w", err)
	}
	return user, nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// dummyHash is a real argon2id hash of a random value, used to equalise timing
// when the email is unknown. It must never match any password.
const dummyHash = "$argon2id$v=19$m=65536,t=3,p=2$" +
	"ZHVtbXlzYWx0Zm9ydGltaW5n$" +
	"J2GhcHFvbHJZa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODk"
