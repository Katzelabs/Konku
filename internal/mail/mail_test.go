package mail

import (
	"bufio"
	"context"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"regexp"
	"strings"
	"testing"

	"github.com/Katzelabs/Konku/internal/i18n"
)

const testAddr = "murid@example.com"

// ---------------------------------------------------------------------------
// Message shape
// ---------------------------------------------------------------------------

// decoded is a rendered message parsed back the way a mail client would read
// it. Asserting against the rendered bytes rather than against the struct is
// the point: the bugs worth catching here are encoding bugs.
type decoded struct {
	header mail.Header
	text   string
	html   string
}

func decode(t *testing.T, raw []byte) decoded {
	t.Helper()

	msg, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("parsing the message: %v", err)
	}

	mediaType, params, err := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	if err != nil {
		t.Fatalf("parsing Content-Type: %v", err)
	}
	if mediaType != "multipart/alternative" {
		t.Fatalf("Content-Type is %q, want multipart/alternative", mediaType)
	}

	out := decoded{header: msg.Header}
	// NextRawPart, not NextPart: NextPart decodes quoted-printable
	// transparently and removes the header that says it did, which would make
	// the encoding assertion below untestable.
	mr := multipart.NewReader(msg.Body, params["boundary"])
	for {
		part, err := mr.NextRawPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("reading a part: %v", err)
		}
		if enc := part.Header.Get("Content-Transfer-Encoding"); enc != "quoted-printable" {
			t.Errorf("part encoded as %q, want quoted-printable", enc)
		}
		body, err := io.ReadAll(quotedprintable.NewReader(part))
		if err != nil {
			t.Fatalf("decoding a part: %v", err)
		}
		switch ct := part.Header.Get("Content-Type"); {
		case strings.HasPrefix(ct, "text/plain"):
			out.text = string(body)
		case strings.HasPrefix(ct, "text/html"):
			out.html = string(body)
		default:
			t.Errorf("unexpected part Content-Type %q", ct)
		}
	}
	return out
}

func TestBothMessagesCarryTextAndHTML(t *testing.T) {
	// An HTML-only message is a well-known spam signal, and deliverability is
	// the entire risk in this feature. So this is not a formatting preference.
	cases := []struct {
		name    string
		locale  i18n.Locale
		build   func(i18n.Locale, string, string) (message, error)
		subject string
		link    string
	}{
		{"verification/id", i18n.ID, verificationMessage,
			"Verifikasi alamat email kamu", "/verify?token=tok"},
		{"reset/id", i18n.ID, passwordResetMessage,
			"Atur ulang kata sandi Konku kamu", "/reset-password?token=tok"},
		// The subject is part of the copy: a bilingual body under an
		// Indonesian subject is worse than either, because the subject is the
		// only part a reader sees before deciding this is spam.
		{"verification/en", i18n.EN, verificationMessage,
			"Verify your email address", "/verify?token=tok"},
		{"reset/en", i18n.EN, passwordResetMessage,
			"Reset your Konku password", "/reset-password?token=tok"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m, err := tc.build(tc.locale, "https://konku.test", "tok")
			if err != nil {
				t.Fatalf("building: %v", err)
			}
			raw, err := m.encode("Konku <no-reply@mail.konku.test>", testAddr)
			if err != nil {
				t.Fatalf("encoding: %v", err)
			}
			got := decode(t, raw)

			if got.text == "" {
				t.Error("no text/plain part")
			}
			if got.html == "" {
				t.Error("no text/html part")
			}
			if s := got.header.Get("Subject"); s != tc.subject {
				t.Errorf("Subject = %q, want %q", s, tc.subject)
			}
			if got.header.Get("Auto-Submitted") != "auto-generated" {
				t.Error("no Auto-Submitted header; vacation responders will reply to no-reply")
			}
			if id := got.header.Get("Message-ID"); !strings.HasSuffix(id, "@mail.konku.test>") {
				t.Errorf("Message-ID %q does not match the sending domain", id)
			}

			want := "https://konku.test" + tc.link
			if !strings.Contains(got.text, want) {
				t.Errorf("text part does not contain %q", want)
			}
			if !strings.Contains(got.html, want) {
				t.Errorf("HTML part does not contain %q", want)
			}
		})
	}
}

func TestMessageUsesCRLF(t *testing.T) {
	// A lone \n is not a line ending on the wire. The failure it causes is a
	// mangled message rather than a rejected one, so nothing else would notice.
	m, err := verificationMessage(i18n.ID, "https://konku.test", "tok")
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	raw, err := m.encode("Konku <no-reply@mail.konku.test>", testAddr)
	if err != nil {
		t.Fatalf("encoding: %v", err)
	}
	for i, b := range raw {
		if b == '\n' && (i == 0 || raw[i-1] != '\r') {
			t.Fatalf("bare LF at byte %d", i)
		}
	}
}

func TestTokenIsEscapedIntoTheLink(t *testing.T) {
	// base64url makes a special character unlikely, not impossible, and
	// "unlikely" is not the standard for the credential that unlocks an account.
	m, err := passwordResetMessage(i18n.ID, "https://konku.test", "a+b/c=d&e")
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	want := "token=a%2Bb%2Fc%3Dd%26e"
	if !strings.Contains(m.text, want) {
		t.Errorf("text link is not escaped; want %q in:\n%s", want, m.text)
	}
	if strings.Contains(m.text, "&e") {
		t.Error("an unescaped & in the token would split the query string")
	}
}

func TestCopyIsNotPunitive(t *testing.T) {
	// Hard rule 6, applied to the surface where guilt copy usually arrives
	// disguised as urgency. Both messages must state the expiry as a fact and
	// reassure the reader who did not ask for them.
	//
	// Both languages, and English is the half that needs watching: it has a far
	// larger vocabulary of gentle blame, and every phrase in it sounds friendly.
	// Same list and same reasoning as internal/i18n/catalog_test.go.
	cases := []struct {
		locale    i18n.Locale
		reassures string
		banned    []string
	}{
		{i18n.ID, "abaikan saja email ini",
			[]string{"segera", "jangan sampai", "akan dihapus", "terakhir", "!"}},
		{i18n.EN, "ignore this message",
			[]string{"don't forget", "make sure you", "act now", "will be deleted",
				"expires", "running out", "last chance", "hurry", "!"}},
	}

	for _, tc := range cases {
		for _, build := range []func(i18n.Locale, string, string) (message, error){
			verificationMessage, passwordResetMessage,
		} {
			m, err := build(tc.locale, "https://konku.test", "tok")
			if err != nil {
				t.Fatalf("%s: building: %v", tc.locale, err)
			}
			if !strings.Contains(m.text, tc.reassures) {
				t.Errorf("%s: no reassurance for a reader who did not request this", tc.locale)
			}
			// The subject is copy too, and it is the half a spam filter and a
			// reader both judge first. The HTML body is scanned with its tags
			// stripped: <!doctype html> is not an exclamation mark.
			for _, part := range []string{m.subject, m.text, stripTags(m.html)} {
				for _, banned := range tc.banned {
					if strings.Contains(strings.ToLower(part), banned) {
						t.Errorf("%s: urgency copy %q; the tone is never punitive",
							tc.locale, banned)
					}
				}
			}
		}
	}
}

func TestEveryLocaleHasCompleteMail(t *testing.T) {
	// The second mechanism (hard rule 9), and the same one internal/i18n uses:
	// `localeCopy` being one struct guarantees the shape, not that anybody
	// filled it in. A nil template panics on the first send; an empty subject
	// arrives as a blank line in somebody's inbox and is never reported.
	for _, l := range i18n.Locales {
		c, ok := catalogs[l]
		if !ok {
			t.Errorf("i18n.Locales carries %q with no mail behind it", l)
			continue
		}
		if missing := i18n.Missing(c); len(missing) > 0 {
			t.Errorf("mail for %q is missing: %v", l, missing)
		}
	}
	if len(catalogs) != len(i18n.Locales) {
		t.Errorf("mail has %d locales, i18n.Locales declares %d", len(catalogs), len(i18n.Locales))
	}
}

func TestEachLocaleSaysSomethingDifferent(t *testing.T) {
	// The likeliest way a translation goes wrong is a copy-paste that was never
	// touched: the struct is complete, the templates parse, and an English
	// reader is served Indonesian. Nothing here is legitimately identical.
	for _, build := range []func(i18n.Locale, string, string) (message, error){
		verificationMessage, passwordResetMessage,
	} {
		id, err := build(i18n.ID, "https://konku.test", "tok")
		if err != nil {
			t.Fatalf("building id: %v", err)
		}
		en, err := build(i18n.EN, "https://konku.test", "tok")
		if err != nil {
			t.Fatalf("building en: %v", err)
		}
		if id.subject == en.subject {
			t.Errorf("both locales use the subject %q", id.subject)
		}
		if id.text == en.text {
			t.Error("both locales use the same text body")
		}
		if id.html == en.html {
			t.Error("both locales use the same HTML body")
		}
		// The lang attribute is not decoration: a screen reader announcing
		// English prose in an Indonesian voice is the same bug as the wrong
		// language, and some clients use it to decide whether to offer a
		// translation.
		if !strings.Contains(id.html, `lang="id"`) {
			t.Error("the Indonesian HTML body does not declare lang=\"id\"")
		}
		if !strings.Contains(en.html, `lang="en"`) {
			t.Error("the English HTML body does not declare lang=\"en\"")
		}
	}
}

func TestAnUnknownLocaleFallsBackToIndonesian(t *testing.T) {
	// i18n.WithLocale validates, so this is unreachable through a request. It
	// is reachable from a future job that reads a locale out of a row, and the
	// fallback has to be the language that is guaranteed to exist (hard rule 8).
	m, err := verificationMessage("pt-BR", "https://konku.test", "tok")
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	id, err := verificationMessage(i18n.ID, "https://konku.test", "tok")
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	if m.subject != id.subject || m.text != id.text {
		t.Error("an unknown locale did not fall back to Indonesian")
	}
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

func TestNew(t *testing.T) {
	const from = "Konku <no-reply@mail.konku.test>"

	cases := []struct {
		name     string
		url      string
		from     string
		base     string
		wantErr  bool
		wantAddr string
		wantTLS  bool
		wantAuth bool
	}{
		{name: "dev catcher", url: "smtp://localhost:1025", from: from, base: "http://localhost:5173",
			wantAddr: "localhost:1025"},
		{name: "implicit TLS with credentials", url: "smtps://resend:key@smtp.resend.com:465", from: from,
			base: "https://konku.test", wantAddr: "smtp.resend.com:465", wantTLS: true, wantAuth: true},
		{name: "default port for smtp", url: "smtp://mail.example.com", from: from, base: "https://konku.test",
			wantAddr: "mail.example.com:587"},
		{name: "default port for smtps", url: "smtps://mail.example.com", from: from, base: "https://konku.test",
			wantAddr: "mail.example.com:465", wantTLS: true},
		{name: "trailing slash trimmed from baseURL", url: "smtp://localhost:1025", from: from,
			base: "https://konku.test/", wantAddr: "localhost:1025"},

		{name: "unknown scheme", url: "http://localhost:1025", from: from, base: "https://konku.test", wantErr: true},
		{name: "no host", url: "smtp://", from: from, base: "https://konku.test", wantErr: true},
		{name: "unparseable From", url: "smtp://localhost:1025", from: "not an address", base: "https://konku.test", wantErr: true},
		{name: "no baseURL", url: "smtp://localhost:1025", from: from, base: "", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, err := New(tc.url, tc.from, tc.base)
			if tc.wantErr {
				if err == nil {
					t.Fatal("want an error, got none")
				}
				return
			}
			if err != nil {
				t.Fatalf("New: %v", err)
			}
			if s.addr != tc.wantAddr {
				t.Errorf("addr = %q, want %q", s.addr, tc.wantAddr)
			}
			if s.implicitTLS != tc.wantTLS {
				t.Errorf("implicitTLS = %v, want %v", s.implicitTLS, tc.wantTLS)
			}
			if (s.auth != nil) != tc.wantAuth {
				t.Errorf("auth set = %v, want %v", s.auth != nil, tc.wantAuth)
			}
			if s.envelopeFrom != "no-reply@mail.konku.test" {
				t.Errorf("envelopeFrom = %q; MAIL FROM must be the bare address", s.envelopeFrom)
			}
			if strings.HasSuffix(s.baseURL, "/") {
				t.Errorf("baseURL %q keeps its trailing slash; links would double the slash", s.baseURL)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

// fakeSMTP is enough of RFC 5321 to hold one conversation. It exists so the
// send path is exercised for real — dialogue order, CRLF, dot-stuffing and the
// terminating "." are all things a mock of Sender would not have caught.
type fakeSMTP struct {
	addr       string
	rcptStatus string // the reply to RCPT TO, e.g. "250 OK" or "550 no such user"

	received chan string // the DATA payload
}

func newFakeSMTP(t *testing.T, rcptStatus string) *fakeSMTP {
	t.Helper()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listening: %v", err)
	}
	t.Cleanup(func() { ln.Close() })

	f := &fakeSMTP{addr: ln.Addr().String(), rcptStatus: rcptStatus, received: make(chan string, 1)}

	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		f.serve(conn)
	}()
	return f
}

func (f *fakeSMTP) serve(conn net.Conn) {
	r := bufio.NewReader(conn)
	w := func(s string) { conn.Write([]byte(s + "\r\n")) }

	w("220 fake ESMTP")
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
			// No STARTTLS advertised: this is the loopback catcher's shape.
			w("250-fake")
			w("250 SIZE 10485760")
		case strings.HasPrefix(cmd, "MAIL FROM"):
			w("250 OK")
		case strings.HasPrefix(cmd, "RCPT TO"):
			w(f.rcptStatus)
		case cmd == "DATA":
			w("354 End data with <CRLF>.<CRLF>")
			var body strings.Builder
			for {
				l, err := r.ReadString('\n')
				if err != nil {
					return
				}
				if l == ".\r\n" {
					break
				}
				body.WriteString(l)
			}
			select {
			case f.received <- body.String():
			default:
			}
			w("250 OK")
		case cmd == "QUIT":
			w("221 Bye")
			return
		default:
			w("500 unrecognised")
		}
	}
}

func TestSendDeliversToTheServer(t *testing.T) {
	f := newFakeSMTP(t, "250 OK")

	s, err := New("smtp://"+f.addr, "Konku <no-reply@mail.konku.test>", "https://konku.test")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := s.SendVerification(context.Background(), i18n.ID, testAddr, "tok-123"); err != nil {
		t.Fatalf("SendVerification: %v", err)
	}

	body := <-f.received
	if !strings.Contains(body, "To: "+testAddr) {
		t.Error("the delivered message has no To header for the recipient")
	}

	// Decoded rather than matched raw: the body is quoted-printable on the
	// wire, so the link's "=" arrives as "=3D". Asserting against the raw
	// bytes would be asserting the encoding twice and the content not at all.
	got := decode(t, []byte(body))
	const want = "https://konku.test/verify?token=tok-123"
	if !strings.Contains(got.text, want) {
		t.Errorf("the delivered text part does not contain %q", want)
	}
	if !strings.Contains(got.html, want) {
		t.Errorf("the delivered HTML part does not contain %q", want)
	}
}

func TestSendErrorNeverCarriesTheAddress(t *testing.T) {
	// Hard rule 10. A rejected recipient is the most natural place to write the
	// address into an error, and the error reaches the log the moment a handler
	// logs it — which is the path that looks harmless.
	f := newFakeSMTP(t, "550 no such user")

	s, err := New("smtp://"+f.addr, "Konku <no-reply@mail.konku.test>", "https://konku.test")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	err = s.SendVerification(context.Background(), i18n.ID, testAddr, "tok")
	if err == nil {
		t.Fatal("want an error from a rejected recipient, got none")
	}
	if strings.Contains(err.Error(), testAddr) {
		t.Errorf("the error carries the recipient address: %v", err)
	}
	if strings.Contains(err.Error(), "murid") {
		t.Errorf("the error carries the local part of the address: %v", err)
	}
}

// stripTags removes markup so the punitive check reads prose rather than HTML.
var tag = regexp.MustCompile(`<[^>]*>`)

func stripTags(html string) string { return tag.ReplaceAllString(html, " ") }
