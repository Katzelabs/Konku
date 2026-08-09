package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
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
	// Explicit opt-in for non-interactive use — automated setup and the e2e
	// suite, which have no terminal to prompt at. Deliberately a flag that
	// says "read stdin" rather than a flag that carries the password: the
	// secret still never appears in argv, in `ps`, or in shell history. This
	// is the same shape as `docker login --password-stdin`, for the same
	// reason.
	passwordStdin := fs.Bool("password-stdin", false,
		"read the password from stdin instead of prompting")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*email) == "" {
		return errors.New("seed-user: -email is required")
	}

	// The password is never a flag: flags land in shell history and in `ps`.
	password, err := readPassword(*passwordStdin)
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

// readPassword prompts, or reads one line from stdin when asked to.
//
// The unasked-for pipe is still refused. That check exists to catch an
// accident — a script redirecting stdin without meaning to — and an explicit
// -password-stdin is not an accident.
func readPassword(fromStdin bool) (string, error) {
	if fromStdin {
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil && !errors.Is(err, io.EOF) {
			return "", fmt.Errorf("seed-user: reading password from stdin: %w", err)
		}
		password := strings.TrimRight(line, "\r\n")
		if len(password) < minPasswordLength {
			return "", fmt.Errorf("seed-user: password must be at least %d characters", minPasswordLength)
		}
		return password, nil
	}

	return promptPassword()
}

func promptPassword() (string, error) {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return "", errors.New("seed-user: refusing to read a password from a pipe; " +
			"run this interactively, or pass -password-stdin if that is what you meant")
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
