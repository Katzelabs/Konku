// Package mail sends the two transactional messages the account surface needs:
// address verification and password reset.
//
// stdlib net/smtp against Resend's SMTP endpoint (D-068). An SDK for "send one
// templated message" is not a trade worth making, and Resend speaks plain SMTP,
// so the transport is already in the standard library — D-065's "name the
// obligation this dependency discharges" never has to be argued.
//
// Two rules run through this file and are easy to break by accident:
//
//   - **No error or log line in this package carries the recipient address.**
//     Hard rule 10: a user_id and a request id are enough to debug and not
//     enough to leak. An address in `fmt.Errorf` reaches the log the moment a
//     handler logs the error, which is exactly the path that looks harmless.
//   - **SMTP wants CRLF.** Every line of a message is terminated \r\n. A lone
//     \n is not a line ending on the wire, and the failure it produces is a
//     mangled message rather than a rejected one.
package mail

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"net/url"
	"strings"
	"time"

	"github.com/Katzelabs/Konku/internal/i18n"
)

// sendTimeout bounds a whole SMTP conversation when the caller's context has
// no deadline of its own. A hung provider must not hold a signup request open
// indefinitely.
const sendTimeout = 30 * time.Second

// Sender delivers messages over SMTP. The zero value is not usable; call New.
type Sender struct {
	addr string
	host string
	auth smtp.Auth
	// implicitTLS is smtps:// — TLS from the first byte, port 465. The
	// alternative is STARTTLS on 587, negotiated after the greeting.
	implicitTLS bool

	// envelopeFrom is the bare address for MAIL FROM; fromHeader keeps any
	// display name for the From: header. "Konku <no-reply@…>" is not a valid
	// envelope sender.
	envelopeFrom string
	fromHeader   string

	baseURL string
}

// New builds a Sender from a URL of the form
//
//	smtp://localhost:1025                      (dev, Mailpit, no auth)
//	smtps://resend:API_KEY@smtp.resend.com:465 (production)
//
// from is the From: header, with or without a display name. baseURL is the
// origin the links in the templates are built against, with no trailing slash.
func New(smtpURL, from, baseURL string) (*Sender, error) {
	u, err := url.Parse(smtpURL)
	if err != nil {
		return nil, fmt.Errorf("mail: parsing SMTP_URL: %w", err)
	}

	s := &Sender{baseURL: strings.TrimRight(baseURL, "/")}

	switch u.Scheme {
	case "smtp":
	case "smtps":
		s.implicitTLS = true
	default:
		return nil, fmt.Errorf("mail: SMTP_URL scheme %q is not smtp or smtps", u.Scheme)
	}

	s.host = u.Hostname()
	if s.host == "" {
		return nil, fmt.Errorf("mail: SMTP_URL has no host")
	}
	port := u.Port()
	if port == "" {
		// 587 is submission-with-STARTTLS, 465 is implicit TLS. Both are the
		// conventional default for their scheme.
		port = "587"
		if s.implicitTLS {
			port = "465"
		}
	}
	s.addr = net.JoinHostPort(s.host, port)

	if u.User != nil {
		pass, _ := u.User.Password()
		// PlainAuth refuses to hand credentials to an unencrypted, non-local
		// connection. That refusal is a feature and is deliberately not worked
		// around: a provider that wants a password wants TLS.
		s.auth = smtp.PlainAuth("", u.User.Username(), pass, s.host)
	}

	addr, err := mail.ParseAddress(from)
	if err != nil {
		return nil, fmt.Errorf("mail: parsing the From address: %w", err)
	}
	s.envelopeFrom = addr.Address
	s.fromHeader = addr.String()

	if s.baseURL == "" {
		return nil, fmt.Errorf("mail: baseURL is required; the templates build links against it")
	}
	return s, nil
}

// SendVerification sends the address-verification message for a new account.
//
// token is the raw token, which exists in exactly two places: this message and
// the user's mailbox. The database holds only its hash (07 L1).
//
// l is an argument rather than something read off ctx, and that is deliberate.
// Everywhere else in the server the request's locale travels on the context and
// `i18n.FromContext` is the right way to ask for it — but mail is the one thing
// that leaves. A message in the wrong language is invisible to everybody in the
// loop, because nobody in the loop reads it; and the sender that a reminder job
// will eventually be (PRD §5.11) has no request behind it at all and would
// silently take the default. Naming the locale in the signature makes the
// caller answer "whose language?" out loud.
func (s *Sender) SendVerification(ctx context.Context, l i18n.Locale, to, token string) error {
	m, err := verificationMessage(l, s.baseURL, token)
	if err != nil {
		return err
	}
	return s.send(ctx, to, m)
}

// SendPasswordReset sends the password-reset message.
func (s *Sender) SendPasswordReset(ctx context.Context, l i18n.Locale, to, token string) error {
	m, err := passwordResetMessage(l, s.baseURL, token)
	if err != nil {
		return err
	}
	return s.send(ctx, to, m)
}

func (s *Sender) send(ctx context.Context, to string, m message) error {
	raw, err := m.encode(s.fromHeader, to)
	if err != nil {
		return err
	}

	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(sendTimeout)
	}

	d := net.Dialer{}
	var conn net.Conn
	if s.implicitTLS {
		conn, err = (&tls.Dialer{
			NetDialer: &d,
			Config:    &tls.Config{ServerName: s.host},
		}).DialContext(ctx, "tcp", s.addr)
	} else {
		conn, err = d.DialContext(ctx, "tcp", s.addr)
	}
	if err != nil {
		return fmt.Errorf("mail: dialing %s: %w", s.addr, err)
	}
	defer conn.Close()

	// One deadline covering the whole conversation. net/smtp has no context
	// support, so this is what stops a half-open connection from hanging a
	// request until the server gives up.
	if err := conn.SetDeadline(deadline); err != nil {
		return fmt.Errorf("mail: setting the connection deadline: %w", err)
	}

	c, err := smtp.NewClient(conn, s.host)
	if err != nil {
		return fmt.Errorf("mail: SMTP greeting: %w", err)
	}
	defer c.Close()

	if !s.implicitTLS {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(&tls.Config{ServerName: s.host}); err != nil {
				return fmt.Errorf("mail: STARTTLS: %w", err)
			}
		}
		// No error when the server does not offer STARTTLS. That is the dev
		// catcher on loopback, and refusing it would mean the local flow could
		// not be tested at all. Production uses smtps:// and never reaches
		// this branch; PlainAuth refuses to leak credentials here regardless.
	}

	if s.auth != nil {
		if err := c.Auth(s.auth); err != nil {
			return fmt.Errorf("mail: authenticating: %w", err)
		}
	}

	if err := c.Mail(s.envelopeFrom); err != nil {
		return fmt.Errorf("mail: MAIL FROM: %w", err)
	}
	// Deliberately not wrapped with the address (hard rule 10). "recipient
	// rejected" plus the user_id the caller already has is enough.
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("mail: recipient rejected: %w", err)
	}

	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("mail: DATA: %w", err)
	}
	if _, err := w.Write(raw); err != nil {
		return fmt.Errorf("mail: writing the message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("mail: closing the message: %w", err)
	}

	if err := c.Quit(); err != nil {
		return fmt.Errorf("mail: QUIT: %w", err)
	}
	return nil
}
