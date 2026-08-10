package mail

import (
	"bytes"
	"fmt"
	htmltemplate "html/template"
	"net/url"
	texttemplate "text/template"
)

// The two messages, in Bahasa Indonesia (hard rule 8).
//
// Tone is the same constraint as the rest of the product: never punitive
// (hard rule 6). Transactional mail is where guilt copy creeps in disguised as
// urgency — "your account will be deleted", "don't miss out", a countdown. None
// of that is here. An expiry is stated once as a fact, and the "you didn't ask
// for this" line reassures rather than warns.
//
// No images, no tracking pixel, no external stylesheet. A remote image in a
// verification mail is a privacy leak the user did not agree to and a
// deliverability cost, and there is no analytics here to feed anyway (D-066).

const (
	verifyPath = "/verify"
	resetPath  = "/reset-password"
)

var (
	verifyText = mustText("verify.txt", `Halo,

Akun Konku kamu hampir siap. Buka tautan di bawah ini untuk memverifikasi alamat email ini:

{{.URL}}

Tautan ini berlaku 24 jam.

Kalau kamu tidak membuat akun Konku, abaikan saja email ini. Tidak ada yang terjadi.

— Konku
`)

	verifyHTML = mustHTML("verify.html", `<!doctype html>
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
`)

	resetText = mustText("reset.txt", `Halo,

Ada permintaan untuk mengatur ulang kata sandi akun Konku kamu. Buka tautan di bawah ini untuk membuat kata sandi baru:

{{.URL}}

Tautan ini berlaku 1 jam dan hanya bisa dipakai sekali.

Kalau kamu tidak meminta ini, abaikan saja email ini. Kata sandi kamu tidak berubah.

— Konku
`)

	resetHTML = mustHTML("reset.html", `<!doctype html>
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
`)
)

func verificationMessage(baseURL, token string) (message, error) {
	return render("Verifikasi alamat email kamu", verifyText, verifyHTML,
		link(baseURL, verifyPath, token))
}

func passwordResetMessage(baseURL, token string) (message, error) {
	return render("Atur ulang kata sandi Konku kamu", resetText, resetHTML,
		link(baseURL, resetPath, token))
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
