package mail

import (
	"bytes"
	"fmt"
	htmltemplate "html/template"
	"net/url"
	texttemplate "text/template"

	"github.com/Katzelabs/Konku/internal/i18n"
)

// The two messages, in Bahasa Indonesia and English (hard rule 8, D-094).
//
// # Why the copy is here and not in internal/i18n
//
// Everything else the server says to a reader lives in `internal/i18n`, and
// nothing may live in two catalogs. These do not: a mail body is a *parsed
// template*, not a string, and putting `*html/template.Template` fields in the
// shared catalog would make `internal/i18n` own rendering and escaping for the
// sake of two messages. So the mail copy lives with the transport that sends it
// and keeps the same two mechanisms (hard rule 9): `localeCopy` is one struct
// per locale, and `templates_test.go` runs `i18n.Missing` over every one of
// them, in both directions, exactly as `catalog_test.go` does.
//
// **The subject is part of the copy**, and it is the half that gets forgotten:
// a bilingual body under an Indonesian subject is worse than either, because
// the subject is the only part a reader sees before deciding it is spam.
//
// # Tone
//
// The same constraint as the rest of the product: never punitive (hard rule 6).
// Transactional mail is where guilt copy creeps in disguised as urgency — "your
// account will be deleted", "don't miss out", a countdown. None of that is
// here. An expiry is stated once as a fact, and the "you didn't ask for this"
// line reassures rather than warns.
//
// English is translated from the Indonesian, not written beside it. Read the
// header of `internal/i18n/en.go` before touching it.
//
// # Everything else
//
// No images, no tracking pixel, no external stylesheet. A remote image in a
// verification mail is a privacy leak the user did not agree to and a
// deliverability cost, and there is no analytics here to feed anyway (D-066).

const (
	verifyPath = "/verify"
	resetPath  = "/reset-password"
)

// localeCopy is one language's half of both messages.
//
// Exported field names because i18n.Missing walks with reflection and skips
// unexported fields — a leaf it cannot see is a leaf it cannot report empty.
type localeCopy struct {
	VerifySubj string
	VerifyText *texttemplate.Template
	VerifyHTML *htmltemplate.Template
	ResetSubj  string
	ResetText  *texttemplate.Template
	ResetHTML  *htmltemplate.Template
}

// catalogs is every locale's mail, and the only place any of it is reachable from.
//
// A map keyed by i18n.Locale rather than a switch, for the same reason
// internal/i18n uses one: a locale added to i18n.Locales with no mail behind it
// is caught by a test rather than by a reader noticing a missing case.
var catalogs = map[i18n.Locale]localeCopy{
	i18n.ID: {
		VerifySubj: "Verifikasi alamat email kamu",
		VerifyText: mustText("verify.id.txt", `Halo,

Akun Konku kamu hampir siap. Buka tautan di bawah ini untuk memverifikasi alamat email ini:

{{.URL}}

Tautan ini berlaku 24 jam.

Kalau kamu tidak membuat akun Konku, abaikan saja email ini. Tidak ada yang terjadi.

— Konku
`),
		VerifyHTML: mustHTML("verify.id.html", `<!doctype html>
<html lang="id">
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#1f2933;">
<p>Halo,</p>
<p>Akun Konku kamu hampir siap. Buka tautan di bawah ini untuk memverifikasi alamat email ini:</p>
<p><a href="{{.URL}}">Verifikasi alamat email</a></p>
<p>Kalau tautannya tidak bisa diklik, salin alamat ini ke browser:<br>
<span style="word-break:break-all;">{{.URL}}</span></p>
<p>Tautan ini berlaku 24 jam.</p>
<p>Kalau kamu tidak membuat akun Konku, abaikan saja email ini. Tidak ada yang terjadi.</p>
<p>— Konku</p>
</body>
</html>
`),
		ResetSubj: "Atur ulang kata sandi Konku kamu",
		ResetText: mustText("reset.id.txt", `Halo,

Ada permintaan untuk mengatur ulang kata sandi akun Konku kamu. Buka tautan di bawah ini untuk membuat kata sandi baru:

{{.URL}}

Tautan ini berlaku 1 jam dan hanya bisa dipakai sekali.

Kalau kamu tidak meminta ini, abaikan saja email ini. Kata sandi kamu tidak berubah.

— Konku
`),
		ResetHTML: mustHTML("reset.id.html", `<!doctype html>
<html lang="id">
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#1f2933;">
<p>Halo,</p>
<p>Ada permintaan untuk mengatur ulang kata sandi akun Konku kamu. Buka tautan di bawah ini untuk membuat kata sandi baru:</p>
<p><a href="{{.URL}}">Atur ulang kata sandi</a></p>
<p>Kalau tautannya tidak bisa diklik, salin alamat ini ke browser:<br>
<span style="word-break:break-all;">{{.URL}}</span></p>
<p>Tautan ini berlaku 1 jam dan hanya bisa dipakai sekali.</p>
<p>Kalau kamu tidak meminta ini, abaikan saja email ini. Kata sandi kamu tidak berubah.</p>
<p>— Konku</p>
</body>
</html>
`),
	},

	i18n.EN: {
		VerifySubj: "Verify your email address",
		VerifyText: mustText("verify.en.txt", `Hello,

Your Konku account is almost ready. Open the link below to verify this email address:

{{.URL}}

This link works for 24 hours.

If you did not create a Konku account, ignore this message. Nothing happens.

— Konku
`),
		VerifyHTML: mustHTML("verify.en.html", `<!doctype html>
<html lang="en">
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#1f2933;">
<p>Hello,</p>
<p>Your Konku account is almost ready. Open the link below to verify this email address:</p>
<p><a href="{{.URL}}">Verify email address</a></p>
<p>If the link is not clickable, copy this address into your browser:<br>
<span style="word-break:break-all;">{{.URL}}</span></p>
<p>This link works for 24 hours.</p>
<p>If you did not create a Konku account, ignore this message. Nothing happens.</p>
<p>— Konku</p>
</body>
</html>
`),
		ResetSubj: "Reset your Konku password",
		ResetText: mustText("reset.en.txt", `Hello,

Someone asked to reset the password on your Konku account. Open the link below to set a new one:

{{.URL}}

This link works for 1 hour and can be used once.

If you did not ask for this, ignore this message. Your password is unchanged.

— Konku
`),
		ResetHTML: mustHTML("reset.en.html", `<!doctype html>
<html lang="en">
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#1f2933;">
<p>Hello,</p>
<p>Someone asked to reset the password on your Konku account. Open the link below to set a new one:</p>
<p><a href="{{.URL}}">Reset password</a></p>
<p>If the link is not clickable, copy this address into your browser:<br>
<span style="word-break:break-all;">{{.URL}}</span></p>
<p>This link works for 1 hour and can be used once.</p>
<p>If you did not ask for this, ignore this message. Your password is unchanged.</p>
<p>— Konku</p>
</body>
</html>
`),
	},
}

// copyFor returns one locale's mail, or the Indonesian one.
//
// Never nil and never a zero struct, matching i18n.For: a caller that has to
// check before it can render will eventually skip the check, and the failure
// would be an empty message delivered to a real mailbox.
func copyFor(l i18n.Locale) localeCopy {
	if c, ok := catalogs[l]; ok {
		return c
	}
	return catalogs[i18n.Default]
}

func verificationMessage(l i18n.Locale, baseURL, token string) (message, error) {
	c := copyFor(l)
	return render(c.VerifySubj, c.VerifyText, c.VerifyHTML, link(baseURL, verifyPath, token))
}

func passwordResetMessage(l i18n.Locale, baseURL, token string) (message, error) {
	c := copyFor(l)
	return render(c.ResetSubj, c.ResetText, c.ResetHTML, link(baseURL, resetPath, token))
}

// link builds the URL the user clicks. The token goes through url.Values so a
// token containing a character that is special in a query string cannot break
// out of it — base64url makes that unlikely rather than impossible, and
// "unlikely" is not the standard for the credential that unlocks an account.
func link(baseURL, path, token string) string {
	return baseURL + path + "?" + url.Values{"token": {token}}.Encode()
}

func render(subject string, text *texttemplate.Template, html *htmltemplate.Template, url string) (message, error) {
	data := struct{ URL string }{URL: url}

	var t, h bytes.Buffer
	if err := text.Execute(&t, data); err != nil {
		return message{}, fmt.Errorf("mail: rendering the text body: %w", err)
	}
	// html/template, not text/template, for this half: it escapes the URL in
	// href context correctly. The token is ours, but a template that would
	// mis-handle a hostile value is one refactor away from receiving one.
	if err := html.Execute(&h, data); err != nil {
		return message{}, fmt.Errorf("mail: rendering the HTML body: %w", err)
	}
	return message{subject: subject, text: t.String(), html: h.String()}, nil
}

func mustText(name, body string) *texttemplate.Template {
	return texttemplate.Must(texttemplate.New(name).Parse(body))
}

func mustHTML(name, body string) *htmltemplate.Template {
	return htmltemplate.Must(htmltemplate.New(name).Parse(body))
}
