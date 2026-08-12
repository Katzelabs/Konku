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

// The release tag has to arrive empty when unset, or the build stamp cannot
// win.
//
// This defaulted to "dev" here, which made main.go's fallback dead code and
// tagged every production Sentry event `release=dev` — so a regression pointed
// at nothing, which is the one thing the release tag exists to prevent (D-062).
func TestSentryReleaseIsEmptyUnlessSet(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://konku@localhost:5433/konku")
	t.Setenv("DEV", "true")
	// Cleared explicitly: `make` exports .env into the test environment, so a
	// developer with SENTRY_RELEASE set locally would otherwise see this pass
	// or fail depending on their own machine.
	t.Setenv("SENTRY_RELEASE", "")

	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.SentryRelease != "" {
		t.Errorf("SentryRelease = %q with the variable unset, want empty so the "+
			"build stamp can fill it", c.SentryRelease)
	}

	// And an explicit value still wins over the stamp.
	t.Setenv("SENTRY_RELEASE", "v1.2.3")
	c, err = Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.SentryRelease != "v1.2.3" {
		t.Errorf("SentryRelease = %q, want the explicit value", c.SentryRelease)
	}
}

func TestPublicBaseURLDefaultsToTheDevServer(t *testing.T) {
	// A wrong value here sends every user to a host that cannot verify them,
	// and the mail is already delivered by the time anyone notices. The default
	// is the Vite origin because that is where the links have to land locally.
	t.Setenv("DATABASE_URL", "postgres://konku@localhost:5433/konku")
	t.Setenv("DEV", "true")
	t.Setenv("PUBLIC_BASE_URL", "")

	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.PublicBaseURL != "http://localhost:5173" {
		t.Errorf("PublicBaseURL = %q, want the dev server origin", c.PublicBaseURL)
	}
}
