package main

import (
	"errors"
	"flag"
)

// seedUser creates the first account.
//
// There is no public signup in the MVP: registration sits behind ALLOW_SIGNUP,
// default off, which is the correct default for a self-hosted box regardless
// of intent (D-039).
//
//	konku seed-user -email you@example.com
//
// TODO(MVP): prompt for the password on stdin with term.ReadPassword so it
// never lands in shell history, hash it with argon2id, insert the user.
func seedUser(args []string) error {
	fs := flag.NewFlagSet("seed-user", flag.ExitOnError)
	email := fs.String("email", "", "email address for the account")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *email == "" {
		return errors.New("seed-user: -email is required")
	}
	return errors.New("seed-user: not implemented yet")
}
