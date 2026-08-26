package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/store"
)

// suspendUser stops an account, or puts it back.
//
// Signup opens with no waitlist and no invite code (D-095), which means
// strangers' data and, eventually, a stranger who has to be stopped. Before
// this existed the only answer was an operator writing UPDATE at a psql prompt
// — against a column that did not exist — with nothing to revoke the sessions
// that were already open.
//
//	konku suspend-user -email someone@example.com
//	konku suspend-user -email someone@example.com -undo
//
// Suspension is reversible and holds nothing, which is exactly why it is a
// command and not a policy discussion. It is not deletion: the rows stay, the
// address stays claimed, and -undo puts the account back as it was. Deleting
// an account is the owner's own DELETE /api/account (07 L7) and there is no
// operator path to it on purpose.
func suspendUser(args []string) error {
	fs := flag.NewFlagSet("suspend-user", flag.ExitOnError)
	email := fs.String("email", "", "email address of the account")
	// -undo rather than -unsuspend: the two flag names would differ by two
	// characters at the end of a long line, in a command an operator runs
	// under pressure, where picking the wrong one silently does the opposite
	// of what was meant.
	undo := fs.Bool("undo", false, "lift a suspension instead of applying one")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*email) == "" {
		return errors.New("suspend-user: -email is required")
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

	// Deliberately does NOT migrate, where seed-user does.
	//
	// seed-user's first run is against an empty database and has to build one.
	// This runs against a live production database whose schema is the server
	// process's job, and it is run during an incident. A command that quietly
	// applies pending DDL as a side effect of "stop this account" is a
	// surprise at exactly the wrong moment — and it would need the owner
	// credentials, which an operator shelling into the app container does not
	// necessarily have.

	svc := auth.NewService(st, cfg.SessionTTL)

	if *undo {
		id, err := svc.Unsuspend(ctx, *email)
		if err != nil {
			return wrapNoAccount("suspend-user", err)
		}
		fmt.Printf("Account %s is active again. Its owner signs in as usual;\n"+
			"the sessions that were revoked at suspension do not come back.\n", id)
		return nil
	}

	id, since, err := svc.Suspend(ctx, *email)
	if err != nil {
		// A revocation failure still leaves the account suspended and blocked
		// on every request, so say so rather than letting the error read as
		// "nothing happened". The id is printed for the same reason it is
		// logged: it is enough to act on and not enough to leak (hard rule 10).
		if id != uuid.Nil {
			fmt.Printf("Account %s is suspended, but signing out its open sessions failed.\n"+
				"Every request from it is refused regardless. Re-run this command to retry.\n", id)
		}
		return wrapNoAccount("suspend-user", err)
	}

	fmt.Printf("Account %s is suspended (since %s).\n"+
		"Its open sessions are revoked, login is refused, and every data route "+
		"answers 403.\nRun with -undo to lift it.\n", id, since.UTC().Format("2006-01-02 15:04:05 MST"))
	return nil
}

// wrapNoAccount gives the one expected failure a message an operator can act
// on, and leaves everything else alone.
//
// The address is not repeated back. main.go hands a failed subcommand to slog,
// and an email address in an error string becomes an email address in a log
// line (hard rule 10, D-062).
func wrapNoAccount(cmd string, err error) error {
	if errors.Is(err, auth.ErrNoAccount) {
		return fmt.Errorf("%s: no account with that email address; "+
			"check the spelling — the address is matched exactly, "+
			"case and surrounding spaces aside", cmd)
	}
	return err
}
