package api

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/i18n"
)

// Ticket 11 I3: the server speaks the reader's language too.
//
// Two things are asserted here and they are different questions. The first is
// that no sentence is typed into a handler any more — that is the Go side of
// `make check-i18n`, which does the same job for `web/src`. The second is that
// the locale on the request context actually reaches the response, and that
// nothing about the `code` moved when the `message` did.

// developerFacing is every writeError call that may still hold a literal, with
// the reason.
//
// Deliberately tiny, and every entry has to argue for itself. Hard rule 8 keeps
// developer output English; a message that is genuinely addressed to whoever
// ran `make` is not copy, and putting it in the catalog would mean translating
// a sentence no user will ever read.
var developerFacing = map[string]string{
	"spa.go": "the frontend has never been built — only reachable in dev, and " +
		"addressed to whoever just started the binary rather than to a user",
}

func TestNoUserFacingMessageIsALiteral(t *testing.T) {
	// The second mechanism (hard rule 9). The first is that `writeError` now
	// takes its message from a catalog whose completeness is tested — but
	// nothing stops the next handler from typing a sentence in directly, and
	// that string would then exist in exactly one language, with no test able
	// to see it. This is what sees it.
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", func(fi fs.FileInfo) bool {
		return !strings.HasSuffix(fi.Name(), "_test.go")
	}, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}

	// The argument index of the message, per function.
	messageArg := map[string]int{
		"writeError":  3, // (w, status, code, message)
		"rejectQuota": 2, // (w, kind, message) — a method, so the receiver is not counted
	}

	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			base := name[strings.LastIndex(name, "/")+1:]
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}

				fn := calleeName(call.Fun)
				idx, watched := messageArg[fn]
				if !watched || len(call.Args) <= idx {
					return true
				}

				lit, ok := call.Args[idx].(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					return true
				}
				if reason, exempt := developerFacing[base]; exempt {
					t.Logf("%s: literal allowed — %s", base, reason)
					return true
				}

				pos := fset.Position(lit.Pos())
				t.Errorf("%s:%d: %s was given a literal message %s.\n"+
					"User-facing copy ships in both languages (hard rule 8): put it in "+
					"internal/i18n and pass copyFor(r).<Area>.<Leaf>.",
					base, pos.Line, fn, lit.Value)
				return true
			})
		}
	}
}

// calleeName returns the identifier a call is addressed to, ignoring any
// receiver: both `writeError(...)` and `s.rejectQuota(...)` answer with the
// bare function name.
func calleeName(fun ast.Expr) string {
	switch f := fun.(type) {
	case *ast.Ident:
		return f.Name
	case *ast.SelectorExpr:
		return f.Sel.Name
	}
	return ""
}

// ---------------------------------------------------------------------------
// Behaviour: a resolved locale reaches the response, and the code does not move

// decodeError reads the one error shape back off a recorder.
func decodeError(t *testing.T, rec *httptest.ResponseRecorder) errorBody {
	t.Helper()
	var body errorResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decoding the error body: %v", err)
	}
	return body.Error
}

// request builds a request whose context already carries l.
//
// Resolving a locale off an account setting and an Accept-Language header is
// ticket 11 I2's middleware. This calls WithLocale directly, which is what the
// seam in internal/i18n/locale.go exists for: the catalog can be proved to
// answer in the language it was handed without waiting for the thing that
// decides which language that is.
func request(l i18n.Locale, method, target string, body string) *http.Request {
	r := httptest.NewRequest(method, target, strings.NewReader(body))
	return r.WithContext(i18n.WithLocale(r.Context(), l))
}

func TestTheMessageFollowsTheLocaleAndTheCodeDoesNot(t *testing.T) {
	// The point of the whole ticket, asserted as behaviour rather than wiring.
	// `code` is what the client branches on and what every other test keys on;
	// if localising the message had moved a code, this is what would say so.
	cases := []struct {
		name string
		call func(w http.ResponseWriter, r *http.Request)
		code string
		want map[i18n.Locale]string
	}{
		{
			name: "a body that will not decode",
			call: func(w http.ResponseWriter, r *http.Request) {
				var dst struct{ N int }
				decodeJSON(w, r, &dst)
			},
			code: CodeBadRequest,
			want: map[i18n.Locale]string{
				i18n.ID: i18n.For(i18n.ID).Common.BadRequest,
				i18n.EN: i18n.For(i18n.EN).Common.BadRequest,
			},
		},
		{
			name: "a row that is not there, or is not yours",
			call: writeNotFound,
			code: CodeNotFound,
			want: map[i18n.Locale]string{
				i18n.ID: i18n.For(i18n.ID).Common.NotFound,
				i18n.EN: i18n.For(i18n.EN).Common.NotFound,
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, l := range i18n.Locales {
				rec := httptest.NewRecorder()
				tc.call(rec, request(l, http.MethodPost, "/api/notes", "{not json"))

				got := decodeError(t, rec)
				if got.Code != tc.code {
					t.Errorf("%s: code = %q, want %q — a code is language-independent",
						l, got.Code, tc.code)
				}
				if got.Message != tc.want[l] {
					t.Errorf("%s: message = %q, want %q", l, got.Message, tc.want[l])
				}
			}

			// And the two languages are not accidentally the same sentence,
			// which would make the assertions above pass for the wrong reason.
			if tc.want[i18n.ID] == tc.want[i18n.EN] {
				t.Error("both locales produced the same message")
			}
		})
	}
}

func TestAnUnresolvedLocaleAnswersInIndonesian(t *testing.T) {
	// A handler reached with no locale on the context — a code path I2's
	// middleware does not cover, or a request built in a test — must answer in
	// the language that is guaranteed to exist rather than in nothing.
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/notes/x", nil)
	writeNotFound(rec, r)

	if got := decodeError(t, rec).Message; got != i18n.For(i18n.ID).Common.NotFound {
		t.Errorf("message = %q, want the Indonesian fallback", got)
	}
}

func TestTheInternalErrorCarriesTheRequestIDInBothLanguages(t *testing.T) {
	// writeInternal is the one message built from two leaves, because the
	// request id is present or it is not. Both branches, both languages.
	for _, l := range i18n.Locales {
		t.Run(string(l), func(t *testing.T) {
			rec := httptest.NewRecorder()
			rec.Header().Set(requestIDHeader, "req-42")
			writeInternal(rec, request(l, http.MethodGet, "/api/notes", ""), errFake)

			got := decodeError(t, rec)
			if got.Code != CodeInternal {
				t.Errorf("code = %q, want %q", got.Code, CodeInternal)
			}
			if want := i18n.For(l).Common.ServerErrorWithCode("req-42"); got.Message != want {
				t.Errorf("message = %q, want %q", got.Message, want)
			}
			// The id is an opaque token identifying the request, not the
			// person (hard rule 10) — and it has to be in the sentence, or a
			// screenshot is not actionable.
			if !strings.Contains(got.Message, "req-42") {
				t.Error("the message does not carry the request id")
			}

			// No id: the same sentence without the code, not a dangling label.
			bare := httptest.NewRecorder()
			writeInternal(bare, request(l, http.MethodGet, "/api/notes", ""), errFake)
			if want := i18n.For(l).Common.ServerError; decodeError(t, bare).Message != want {
				t.Errorf("with no request id: want %q", want)
			}
		})
	}
}

func TestTheSuspensionMessageTakesTheAddressFromConfig(t *testing.T) {
	// The address is configuration, not copy (ticket 10 O1, ticket 11 I3).
	// D-096 makes self-hosting a real outcome, so a hardcoded address would
	// have every self-hosted instance point its users at somebody else's inbox.
	s := &Server{cfg: config.Config{ContactEmail: "hi@example.test"}}

	for _, l := range i18n.Locales {
		got := s.suspendedMessage(request(l, http.MethodGet, "/api/notes", ""))
		if !strings.Contains(got, "hi@example.test") {
			t.Errorf("%s: the configured address is not in %q", l, got)
		}
		if strings.Contains(got, defaultContactEmail) {
			t.Errorf("%s: the message ignored CONTACT_EMAIL: %q", l, got)
		}
	}

	// An unset value falls back to the address /privacy and /terms publish,
	// rather than to a sentence with a hole in it in front of somebody who is
	// already locked out.
	bare := &Server{}
	if got := bare.suspendedMessage(request(i18n.ID, http.MethodGet, "/", "")); !strings.Contains(got, defaultContactEmail) {
		t.Errorf("with no CONTACT_EMAIL: %q", got)
	}
}

// errFake stands in for a wrapped store error. Its text must never reach the
// client (D-062), which the assertions above cover by comparing the whole
// message against the catalog.
var errFake = &fakeError{}

type fakeError struct{}

func (*fakeError) Error() string { return "store: something the client must not see" }
