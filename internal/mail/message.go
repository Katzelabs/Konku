package mail

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/textproto"
	"strings"
	"time"
)

// message is one composed mail: a subject and both alternative bodies.
//
// Both parts always exist. A text/plain part is not a courtesy to plain-text
// readers — a message with only an HTML body is a well-known spam signal, and
// deliverability is the whole risk in this feature (D-067).
type message struct {
	subject string
	text    string
	html    string
}

// encode renders the message as RFC 5322 bytes ready for SMTP DATA.
func (m message) encode(fromHeader, to string) ([]byte, error) {
	var body bytes.Buffer
	mp := multipart.NewWriter(&body)

	// text/plain first: multipart/alternative is ordered least-preferred to
	// most, so the HTML part has to come second to be the one clients show.
	if err := writePart(mp, "text/plain; charset=utf-8", m.text); err != nil {
		return nil, err
	}
	if err := writePart(mp, "text/html; charset=utf-8", m.html); err != nil {
		return nil, err
	}
	if err := mp.Close(); err != nil {
		return nil, fmt.Errorf("mail: closing the multipart body: %w", err)
	}

	id, err := messageID(fromHeader)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	h := func(k, v string) { fmt.Fprintf(&buf, "%s: %s\r\n", k, v) }

	h("From", fromHeader)
	h("To", to)
	// Q-encoded so a non-ASCII subject survives; Encode leaves pure ASCII
	// untouched, so this costs nothing for the subjects we have today.
	h("Subject", mime.QEncoding.Encode("utf-8", m.subject))
	h("Date", time.Now().Format(time.RFC1123Z))
	h("Message-ID", id)
	// Tells vacation responders and ticketing systems not to reply. Without
	// it, an out-of-office bounces against a no-reply address forever.
	h("Auto-Submitted", "auto-generated")
	h("MIME-Version", "1.0")
	h("Content-Type", "multipart/alternative; boundary="+mp.Boundary())

	buf.WriteString("\r\n")
	buf.Write(body.Bytes())
	return buf.Bytes(), nil
}

func writePart(mp *multipart.Writer, contentType, content string) error {
	head := make(textproto.MIMEHeader)
	head.Set("Content-Type", contentType)
	// Quoted-printable rather than 8bit: it keeps every line under the 998-byte
	// limit RFC 5322 imposes and survives a relay that is not 8BITMIME-clean.
	head.Set("Content-Transfer-Encoding", "quoted-printable")

	w, err := mp.CreatePart(head)
	if err != nil {
		return fmt.Errorf("mail: creating a body part: %w", err)
	}
	qp := quotedprintable.NewWriter(w)
	if _, err := qp.Write([]byte(normaliseNewlines(content))); err != nil {
		return fmt.Errorf("mail: encoding a body part: %w", err)
	}
	if err := qp.Close(); err != nil {
		return fmt.Errorf("mail: flushing a body part: %w", err)
	}
	return nil
}

// normaliseNewlines converts the LF that Go source and templates produce into
// the CRLF the wire format requires, without doubling any CRLF already there.
func normaliseNewlines(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r\n", "\n"), "\n", "\r\n")
}

// messageID builds a globally unique Message-ID.
//
// The domain half comes from the From address so the id matches the sending
// domain — a mismatch there is one of the cheaper spam signals to avoid. The
// local half is 128 bits of CSPRNG rather than a counter or a timestamp, which
// would leak volume.
func messageID(fromHeader string) (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("mail: generating a Message-ID: %w", err)
	}
	domain := "localhost"
	if i := strings.LastIndex(fromHeader, "@"); i >= 0 {
		domain = strings.Trim(fromHeader[i+1:], "> ")
	}
	return "<" + hex.EncodeToString(b[:]) + "@" + domain + ">", nil
}
