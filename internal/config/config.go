// Package config loads configuration from the environment.
//
// Plain os.Getenv on purpose (D-045): a config library earns its keep at a
// scale this project will not reach, and costs indirection from day one.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port string
	// DatabaseURL is the application pool, connecting as the non-owner
	// konku_app role so that FORCE ROW LEVEL SECURITY applies to it (D-059).
	DatabaseURL string
	// MigrationDatabaseURL is the owner, used once at startup and then closed.
	//
	// Two principals so that migrations and the running app are not the same
	// role: the app has no DDL rights at all, so a SQL injection in a handler
	// cannot reach ALTER TABLE, and it cannot disable a policy it is subject
	// to. Empty falls back to DatabaseURL, which is correct only where the two
	// roles are the same.
	MigrationDatabaseURL string
	// SessionSecret is required outside dev and, as of 2026-08-09, is not
	// read by anything.
	//
	// It does NOT sign session cookies: sessions are opaque 256-bit random
	// identifiers stored server-side, so there is nothing signed and no key
	// to invalidate (D-039). Rotating this logs nobody out — verified in
	// docs/runbooks/secrets.md, which also records what does.
	//
	// Left in place rather than deleted because it is a required production
	// variable and removing it is a deployment change, not a code change.
	SessionSecret string
	// AllowSignup gates public registration. Off by default: the correct
	// default for a self-hosted box, and the MVP seeds its first account
	// with `konku seed-user` instead (D-039).
	AllowSignup bool
	// SessionTTL is how long a login lasts before re-authentication.
	SessionTTL time.Duration
	// Dev relaxes cookie Secure so http://localhost works.
	Dev bool
	// SentryDSN enables error tracking. Empty disables it, which is the
	// normal case in dev and in tests — sentry-go treats an empty DSN as a
	// no-op client, so no call site has to check whether Sentry is on.
	SentryDSN string
	// SentryRelease tags every event, so a regression points at a deploy
	// rather than at a date (D-062).
	//
	// Deliberately has **no default here**. main.go fills it from the version
	// stamped into the binary at build time, and it can only do that if an
	// unset variable arrives empty. Defaulting it to "dev" in this file made
	// that fallback dead code and tagged every production event `release=dev`
	// — which is precisely the failure the release tag exists to prevent.
	SentryRelease string
	// SentryEnvironment separates the laptop from the box.
	SentryEnvironment string
	// SMTPURL is the mail transport: smtp://localhost:1025 for the dev catcher,
	// smtps://resend:KEY@smtp.resend.com:465 in production (D-068).
	//
	// Empty means mail is not configured, which is normal on a box where
	// signup is closed — the MVP's one account came from `konku seed-user` and
	// never needed a message sent to it.
	SMTPURL string
	// MailFrom is the From header, e.g. "Konku <no-reply@mail.konku.app>".
	// Sending is from a subdomain so transactional reputation stays separable
	// from the apex (D-068).
	MailFrom string
	// PublicBaseURL is the origin the links in verification and reset mail are
	// built against. It is NOT cosmetic: a wrong value sends every user to a
	// host that cannot verify them, and the mail is already delivered by the
	// time anyone notices.
	PublicBaseURL string
	// ContactEmail is the address a user is pointed at when the application
	// cannot help them itself — today, a suspended account (ticket 10, O1).
	//
	// Configuration rather than copy, and the distinction is the point. It is
	// deployment-specific in exactly the way PublicBaseURL is: D-096 makes
	// self-hosting a real outcome rather than a hypothetical, and a hardcoded
	// address would have every self-hosted instance tell its users to email
	// the operator of konkuapp.katzeapps.com. Keeping it out of the message
	// catalog also means changing it is one env value rather than an edit to
	// the same sentence in two languages.
	//
	// The default is the address already published on /privacy and /terms, so
	// this deployment behaves exactly as it did before the value existed.
	ContactEmail string
	// Per-account quotas (07 L8). Not monetisation: an unbounded free write
	// path on a shared VPS is an outage waiting for one bad actor, and the pgx
	// pool is capped at 10 for the sake of every other project on the box
	// (D-028).
	//
	// Configurable because they are an operational knob — the right value
	// depends on the box, and an operator should not have to rebuild to change
	// one. The defaults are far past any plausible personal knowledge base: a
	// limit a real person trips has made the product worse (hard rule 7).
	MaxNotes           int
	MaxCards           int
	MaxWritesPerMinute int
	// MaxLoginAttempts is the per-IP login budget over five minutes.
	//
	// Configurable for the same reason the quotas are, and for one more: the
	// key is an IP, so the budget is shared by everyone behind it. An office
	// NAT, a phone network, or the end-to-end suite — which signs a fresh
	// account in per test, from one address, in under two minutes — all look
	// like one client to this limiter. The default stays tight; raising it is
	// a deliberate act by whoever knows the deployment.
	MaxLoginAttempts int
	// MetricsAddr is where /metrics is served, on its own listener.
	//
	// A separate socket cannot be exposed by a reverse-proxy misconfiguration
	// the way a route on the main mux can (D-062). Empty disables it.
	//
	// The default is loopback because the default is for a process running on
	// a host, where loopback means what it looks like it means. **In a
	// container it does not**: the namespace gives the container its own
	// loopback, so 127.0.0.1 there is reachable only from inside that
	// container and the listener may as well not exist. Production therefore
	// sets 0.0.0.0 and publishes no port, which is what actually keeps it off
	// the internet (D-081, amending D-062).
	MetricsAddr string
}

func Load() (Config, error) {
	c := Config{
		Port:                 env("PORT", "8080"),
		DatabaseURL:          os.Getenv("DATABASE_URL"),
		MigrationDatabaseURL: os.Getenv("MIGRATION_DATABASE_URL"),
		SessionSecret:        os.Getenv("SESSION_SECRET"),
		AllowSignup:          env("ALLOW_SIGNUP", "false") == "true",
		Dev:                  env("DEV", "false") == "true",
		SentryDSN:            os.Getenv("SENTRY_DSN"),
		SentryRelease:        os.Getenv("SENTRY_RELEASE"),
		SentryEnvironment:    env("SENTRY_ENVIRONMENT", "development"),
		SMTPURL:              os.Getenv("SMTP_URL"),
		MaxNotes:             envInt("MAX_NOTES", 5_000),
		MaxCards:             envInt("MAX_CARDS", 20_000),
		MaxWritesPerMinute:   envInt("MAX_WRITES_PER_MINUTE", 300),
		MaxLoginAttempts:     envInt("MAX_LOGIN_ATTEMPTS", 10),
		MailFrom:             os.Getenv("MAIL_FROM"),
		PublicBaseURL:        env("PUBLIC_BASE_URL", "http://localhost:5173"),
		ContactEmail:         env("CONTACT_EMAIL", "konku@katzeapps.com"),
		// LookupEnv, not env(): METRICS_ADDR is documented as "empty disables
		// it", and env() returns its fallback for an empty value, so setting
		// METRICS_ADDR= would have started the listener anyway.
		MetricsAddr: lookup("METRICS_ADDR", "127.0.0.1:9090"),
	}

	days, err := strconv.Atoi(env("SESSION_TTL_DAYS", "30"))
	if err != nil {
		return Config{}, fmt.Errorf("SESSION_TTL_DAYS: %w", err)
	}
	c.SessionTTL = time.Duration(days) * 24 * time.Hour

	if c.DatabaseURL == "" {
		return Config{}, fmt.Errorf(
			"DATABASE_URL is required. In development run `make dev-api`, which loads .env " +
				"and falls back to the dev Postgres from `make db-up`")
	}
	if c.SessionSecret == "" && !c.Dev {
		return Config{}, fmt.Errorf(
			"SESSION_SECRET is required outside dev. Generate one with: openssl rand -base64 32")
	}

	// Open signup without mail is the one combination that must not start.
	//
	// Verification is required before an account is usable, and the reset link
	// is the only recovery path there is (07 L3, L4). With no transport, every
	// account created is unverifiable and unrecoverable — and the failure is
	// silent from the operator's side, because signup itself returns 204 and
	// the damage is a mailbox that stays empty.
	if c.AllowSignup {
		if c.SMTPURL == "" {
			return Config{}, fmt.Errorf(
				"ALLOW_SIGNUP=true requires SMTP_URL: an account that cannot be " +
					"verified can never be recovered either")
		}
		if c.MailFrom == "" {
			return Config{}, fmt.Errorf("ALLOW_SIGNUP=true requires MAIL_FROM")
		}
	}
	return c, nil
}

// envInt reads a positive integer setting, falling back on anything unset,
// unparseable or non-positive. A zero or negative quota would refuse every
// write, so a typo in an environment variable must not be able to take the
// service down more thoroughly than deleting the variable would.
func envInt(key string, fallback int) int {
	v, err := strconv.Atoi(os.Getenv(key))
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// lookup distinguishes "unset" from "set to empty", for the settings where
// empty is a meaningful value rather than an absent one.
func lookup(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}
