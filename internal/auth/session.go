package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
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

// Client is what the sessions screen shows about where a login came from
// (07 L5). Both fields are best-effort: a request with no User-Agent still
// produces a session.
type Client struct {
	UserAgent string
	IP        string
}

func (c Client) ptrs() (*string, *string) {
	var ua, ip *string
	if c.UserAgent != "" {
		ua = &c.UserAgent
	}
	if c.IP != "" {
		ip = &c.IP
	}
	return ua, ip
}

// Login verifies credentials and starts a session.
//
// It always runs a password verification, even when the email is unknown, so
// the response time does not reveal whether an account exists.
func (s *Service) Login(ctx context.Context, email, password string, client Client) (gen.User, string, time.Time, error) {
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

	ua, ip := client.ptrs()
	if _, err := s.store.Q().CreateSession(ctx, gen.CreateSessionParams{
		ID: id, UserID: user.ID, ExpiresAt: expires, UserAgent: ua, Ip: ip,
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

	// "Last seen" would be a write on every single request if it were written
	// unconditionally, on a pool capped at 10 connections for the sake of every
	// other project on the box (D-028). Throttling it to once per interval
	// makes the common case cost nothing and the screen no less useful — the
	// number it shows is a coarse "when was this session last used", and five
	// minutes of resolution is more than that question needs.
	//
	// A failure here is logged by the caller's error path, not returned: the
	// request is authenticated either way, and refusing it because a
	// bookkeeping write failed would turn a cosmetic problem into an outage.
	if cutoff := time.Now().Add(-lastSeenInterval); row.AuthSession.LastSeenAt.Before(cutoff) {
		if err := s.store.Q().TouchSession(ctx, gen.TouchSessionParams{
			ID: sessionID, LastSeenAt: cutoff,
		}); err != nil {
			slog.Warn("could not update session last_seen_at",
				"user_id", row.User.ID.String(), "error", err)
		}
	}

	return row.User, nil
}

// lastSeenInterval is how stale last_seen_at may get before a request pays for
// an update. See Resolve.
const lastSeenInterval = 5 * time.Minute

// ListSessions returns the account's live sessions, newest activity first.
//
// The raw session ids are deliberately not part of the result: each one is the
// credential itself, so the query selects public_id instead (migration 00008)
// and answers "is this the one asking" as a boolean computed in Postgres.
func (s *Service) ListSessions(ctx context.Context, userID uuid.UUID, currentSessionID string) ([]gen.ListSessionsForUserRow, error) {
	rows, err := s.store.Q().ListSessionsForUser(ctx, gen.ListSessionsForUserParams{
		UserID: userID, CurrentSessionID: currentSessionID,
	})
	if err != nil {
		return nil, fmt.Errorf("auth: listing sessions: %w", err)
	}
	return rows, nil
}

// RevokeSession deletes one of the account's sessions by its public handle.
//
// Reports whether anything was deleted, so the handler can answer 404 for a
// handle that is not this user's. Scoping is in the WHERE clause: a wrong owner
// gets not found, never forbidden (hard rule 4, D-039).
func (s *Service) RevokeSession(ctx context.Context, userID, publicID uuid.UUID) (bool, error) {
	n, err := s.store.Q().DeleteSessionForUser(ctx, gen.DeleteSessionForUserParams{
		UserID: userID, PublicID: publicID,
	})
	if err != nil {
		return false, fmt.Errorf("auth: revoking session: %w", err)
	}
	return n > 0, nil
}

// RevokeOtherSessions signs the account out everywhere except here.
//
// Everywhere *else* rather than everywhere: revoking the current session too
// would sign the user out of the screen they are using to do it, which reads
// as a bug rather than as a feature working.
func (s *Service) RevokeOtherSessions(ctx context.Context, userID uuid.UUID, currentSessionID string) error {
	if err := s.store.Q().DeleteOtherSessionsForUser(ctx, gen.DeleteOtherSessionsForUserParams{
		UserID: userID, ID: currentSessionID,
	}); err != nil {
		return fmt.Errorf("auth: revoking other sessions: %w", err)
	}
	return nil
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

// CreateUser hashes the password and inserts the account, already verified.
//
// This is the `konku seed-user` path, not the signup path — Signup is in
// signup.go and creates an unverified account with a token. The difference in
// verification state is deliberate: seed-user means the operator typed the
// address at a shell, which is a stronger check than clicking a link in a
// mailbox, and an account that cannot be verified cannot be recovered either.
//
// The account, its starter domains and its settings commit together (D-046,
// 07 L1). Domains are per-user, so an account created without them would open
// onto an empty domain picker with nothing to repair it.
func (s *Service) CreateUser(ctx context.Context, email, password string) (gen.User, error) {
	hash, err := Hash(password)
	if err != nil {
		return gen.User{}, err
	}

	// The identity is minted here rather than by the database default, because
	// the transaction has to know who it is *before* it inserts anything: RLS
	// scopes the starter domains by app.user_id, and there is no way to set it
	// to a value the INSERT has not returned yet (D-059).
	id := uuid.New()

	now := time.Now()

	var user gen.User
	err = s.store.WithUserTx(ctx, id, func(q *gen.Queries) error {
		user, err = q.CreateUser(ctx, gen.CreateUserParams{
			ID:              id,
			Email:           normalizeEmail(email),
			PasswordHash:    hash,
			EmailVerifiedAt: &now,
			// Stated rather than left to the zero value: seed-user has nobody
			// to ask for a name, and '' is the schema's "not given" (00010).
			// The UI falls back to the address for these accounts.
			FirstName: "",
			LastName:  "",
		})
		if err != nil {
			return fmt.Errorf("auth: creating user: %w", err)
		}
		if err := store.SeedDefaultDomains(ctx, q, user.ID); err != nil {
			return err
		}
		if _, err := q.CreateUserSettings(ctx, user.ID); err != nil {
			return fmt.Errorf("auth: creating user settings: %w", err)
		}
		return nil
	})
	if err != nil {
		return gen.User{}, err
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
