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
	Port        string
	DatabaseURL string
	// SessionSecret signs session cookies. Must be set in production.
	SessionSecret string
	// AllowSignup gates public registration. Off by default: the correct
	// default for a self-hosted box, and the MVP seeds its first account
	// with `konku seed-user` instead (D-039).
	AllowSignup bool
	// SessionTTL is how long a login lasts before re-authentication.
	SessionTTL time.Duration
	// Dev relaxes cookie Secure so http://localhost works.
	Dev bool
}

func Load() (Config, error) {
	c := Config{
		Port:          env("PORT", "8080"),
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		SessionSecret: os.Getenv("SESSION_SECRET"),
		AllowSignup:   env("ALLOW_SIGNUP", "false") == "true",
		Dev:           env("DEV", "false") == "true",
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
	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
