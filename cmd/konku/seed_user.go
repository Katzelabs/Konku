package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"golang.org/x/term"

	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/store"
)

// minPasswordLength is deliberately modest. This is a self-hosted single-user
// app behind TLS with rate-limited login; a long passphrase beats complexity
// rules, and rules that annoy get worked around.
const minPasswordLength = 12

// seedUser creates an account from the command line.
//
// There is no public signup in the MVP: registration sits behind ALLOW_SIGNUP,
// default off, which is the correct default for a self-hosted box regardless
// of intent (D-039).
//
//	konku seed-user -email you@example.com
func seedUser(args []string) error {
	fs := flag.NewFlagSet("seed-user", flag.ExitOnError)
	email := fs.String("email", "", "email address for the account")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*email) == "" {
		return errors.New("seed-user: -email is required")
	}

	// The password is never a flag: flags land in shell history and in `ps`.
	password, err := promptPassword()
	if err != nil {
		return err
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx := context.Background()
	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	if err := st.Migrate(ctx, cfg.MigrationDatabaseURL); err != nil {
		return err
	}

	svc := auth.NewService(st, cfg.SessionTTL)
	user, err := svc.CreateUser(ctx, *email, password)
	if err != nil {
		// 23505 is unique_violation — the email is already registered.
		if strings.Contains(err.Error(), "23505") {
			return fmt.Errorf("seed-user: %s is already registered", *email)
		}
		return err
	}

	fmt.Printf("Created account %s (%s)\n", user.Email, user.ID)
	return nil
}

func promptPassword() (string, error) {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return "", errors.New("seed-user: refusing to read a password from a pipe; run this interactively")
	}

	fmt.Print("Password: ")
	first, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return "", fmt.Errorf("seed-user: reading password: %w", err)
	}

	fmt.Print("Confirm password: ")
	second, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return "", fmt.Errorf("seed-user: reading password: %w", err)
	}

	if string(first) != string(second) {
		return "", errors.New("seed-user: passwords do not match")
	}
	if len(first) < minPasswordLength {
		return "", fmt.Errorf("seed-user: password must be at least %d characters", minPasswordLength)
	}

	return string(first), nil
}
