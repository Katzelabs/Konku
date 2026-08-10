package config

import (
	"strings"
	"testing"
)

// The one combination that must not start.
//
// Verification is required before an account is usable and the reset link is
// the only recovery path (07 L3, L4), so open signup with no transport creates
// accounts that can never be verified and never be recovered. The failure is
// silent from the operator's side — signup succeeds, and the damage is a
// mailbox that stays empty — which is exactly why it is a startup check rather
// than something to notice later.
func TestSignupRequiresMail(t *testing.T) {
	cases := []struct {
		name        string
		allowSignup string
		smtpURL     string
		mailFrom    string
		wantErr     string
	}{
		{name: "signup closed needs no mail", allowSignup: "false"},
		{name: "signup closed ignores a half-configured transport", allowSignup: "false", smtpURL: "smtp://localhost:1025"},
		{
			name: "signup open without a transport", allowSignup: "true",
			mailFrom: "Konku <no-reply@mail.konku.test>", wantErr: "SMTP_URL",
		},
		{
			name: "signup open without a sender", allowSignup: "true",
			smtpURL: "smtp://localhost:1025", wantErr: "MAIL_FROM",
		},
		{
			name: "signup open, fully configured", allowSignup: "true",
			smtpURL: "smtp://localhost:1025", mailFrom: "Konku <no-reply@mail.konku.test>",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", "postgres://konku@localhost:5433/konku")
			t.Setenv("DEV", "true")
			t.Setenv("ALLOW_SIGNUP", tc.allowSignup)
			t.Setenv("SMTP_URL", tc.smtpURL)
			t.Setenv("MAIL_FROM", tc.mailFrom)

			_, err := Load()
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("Load: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("want an error naming %s, got none", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("error does not name %s: %v", tc.wantErr, err)
			}
		})
	}
}

func TestPublicBaseURLDefaultsToTheDevServer(t *testing.T) {
	// A wrong value here sends every user to a host that cannot verify them,
	// and the mail is already delivered by the time anyone notices. The default
	// is the Vite origin because that is where the links have to land locally.
	t.Setenv("DATABASE_URL", "postgres://konku@localhost:5433/konku")
	t.Setenv("DEV", "true")

	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.PublicBaseURL != "http://localhost:5173" {
		t.Errorf("PublicBaseURL = %q, want the dev server origin", c.PublicBaseURL)
	}
}
