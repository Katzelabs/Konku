package mail

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Katzelabs/Konku/internal/i18n"
)

// End-to-end against the dev SMTP catcher (07 L2).
//
// The unit tests above prove the message is built correctly and that the SMTP
// dialogue is right against a fake. This proves the two together against a
// real server that a human then reads in a browser — which is the difference
// between "the encoder is correct" and "the mail arrived and is legible".
//
// Skips unless MAILPIT_API_URL is set, the same shape as the store and api
// integration tests. `make test-mail` starts the catcher and sets it.
//
// What this deliberately does NOT prove is deliverability. Mailpit accepts
// everything; SPF, DKIM, DMARC and a real inbox are 04-ship S4 (D-067).

func mailpitAPI(t *testing.T) string {
	t.Helper()
	url := os.Getenv("MAILPIT_API_URL")
	if url == "" {
		t.Skip("MAILPIT_API_URL not set; run `make test-mail`")
	}
	return strings.TrimRight(url, "/")
}

type mailpitSummary struct {
	Messages []struct {
		ID      string `json:"ID"`
		Subject string `json:"Subject"`
		To      []struct {
			Address string `json:"Address"`
		} `json:"To"`
	} `json:"messages"`
}

type mailpitMessage struct {
	Subject string `json:"Subject"`
	Text    string `json:"Text"`
	HTML    string `json:"HTML"`
}

func mailpitDo(t *testing.T, method, url string, into any) {
	t.Helper()

	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatalf("building the request: %v", err)
	}
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		t.Fatalf("calling the catcher: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		t.Fatalf("%s %s: status %d", method, url, resp.StatusCode)
	}
	if into != nil {
		if err := json.NewDecoder(resp.Body).Decode(into); err != nil {
			t.Fatalf("decoding the catcher's response: %v", err)
		}
	}
}

func TestMailArrivesInTheCatcher(t *testing.T) {
	api := mailpitAPI(t)

	smtpURL := os.Getenv("MAILPIT_SMTP_URL")
	if smtpURL == "" {
		smtpURL = "smtp://localhost:1025"
	}

	// A clean slate, and cleaned up afterwards so a run does not leave the
	// operator's catcher full of test mail.
	mailpitDo(t, http.MethodDelete, api+"/api/v1/messages", nil)
	t.Cleanup(func() { mailpitDo(t, http.MethodDelete, api+"/api/v1/messages", nil) })

	s, err := New(smtpURL, "Konku <no-reply@mail.konku.test>", "http://localhost:5173")
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	cases := []struct {
		name    string
		send    func(context.Context, i18n.Locale, string, string) error
		locale  i18n.Locale
		token   string
		subject string
		link    string
		// reassures is the line that tells somebody who did not ask for this
		// that nothing has happened to them.
		reassures string
	}{
		{
			name: "verification/id", send: s.SendVerification, locale: i18n.ID,
			token:     "verify-token-1",
			subject:   "Verifikasi alamat email kamu",
			link:      "http://localhost:5173/verify?token=verify-token-1",
			reassures: "abaikan saja email ini",
		},
		{
			name: "reset/id", send: s.SendPasswordReset, locale: i18n.ID,
			token:     "reset-token-1",
			subject:   "Atur ulang kata sandi Konku kamu",
			link:      "http://localhost:5173/reset-password?token=reset-token-1",
			reassures: "abaikan saja email ini",
		},
		// Both languages over the wire, not only through the renderer: the
		// subject is Q-encoded on the way out, and a non-ASCII subject that
		// survives locally can still arrive mangled.
		{
			name: "verification/en", send: s.SendVerification, locale: i18n.EN,
			token:     "verify-token-2",
			subject:   "Verify your email address",
			link:      "http://localhost:5173/verify?token=verify-token-2",
			reassures: "ignore this message",
		},
		{
			name: "reset/en", send: s.SendPasswordReset, locale: i18n.EN,
			token:     "reset-token-2",
			subject:   "Reset your Konku password",
			link:      "http://localhost:5173/reset-password?token=reset-token-2",
			reassures: "ignore this message",
		},
	}

	for _, tc := range cases {
		if err := tc.send(context.Background(), tc.locale, testAddr, tc.token); err != nil {
			t.Fatalf("%s: sending: %v", tc.name, err)
		}
	}

	var summary mailpitSummary
	mailpitDo(t, http.MethodGet, api+"/api/v1/messages", &summary)
	if len(summary.Messages) != len(cases) {
		t.Fatalf("the catcher holds %d messages, want %d", len(summary.Messages), len(cases))
	}

	bySubject := map[string]string{}
	for _, m := range summary.Messages {
		bySubject[m.Subject] = m.ID
		if len(m.To) != 1 || m.To[0].Address != testAddr {
			t.Errorf("%q went to %v, want exactly %s", m.Subject, m.To, testAddr)
		}
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			id, ok := bySubject[tc.subject]
			if !ok {
				t.Fatalf("no message with subject %q; the catcher holds %v", tc.subject, bySubject)
			}

			var msg mailpitMessage
			mailpitDo(t, http.MethodGet, fmt.Sprintf("%s/api/v1/message/%s", api, id), &msg)

			// Both parts, because an HTML-only message is a spam signal and
			// deliverability is the whole risk in this feature.
			if !strings.Contains(msg.Text, tc.link) {
				t.Errorf("the text part has no working link; want %q in:\n%s", tc.link, msg.Text)
			}
			if !strings.Contains(msg.HTML, tc.link) {
				t.Errorf("the HTML part has no working link; want %q in:\n%s", tc.link, msg.HTML)
			}
			// The reassurance line survives encoding and transport, not just
			// template rendering (hard rule 6). Per locale, because that line
			// is exactly the sort of copy a translation drops.
			if !strings.Contains(msg.Text, tc.reassures) {
				t.Error("the delivered text lost its reassurance line")
			}
		})
	}
}
