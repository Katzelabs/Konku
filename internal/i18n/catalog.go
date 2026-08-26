package i18n

import "strconv"

// Catalog is every user-facing string the *server* can produce: the `message`
// half of the one error shape, and nothing else.
//
// This is the Go half of D-094 and the direct counterpart of `Copy` in
// `web/src/i18n/types.ts`. The conventions are that file's, adopted rather than
// re-invented, and they are worth restating because Go cannot enforce all of
// them the way TypeScript can:
//
//  1. **Indonesian is the original.** `id.go` is authored; `en.go` is
//     *translated from it* — the same claims in the same order. Nothing added
//     because an English sentence wanted one more word, nothing dropped
//     because it read awkwardly.
//
//  2. **Never punitive** (hard rule 6), in both languages, and it is English
//     that needs watching. See the header of `en.go`.
//
//  3. **Plain, direct, active voice, sentence case, no filler.**
//
// # The path is the id
//
// Top level is the area of the API the string belongs to; a leaf is named for
// what it *is* — `NameTooLong`, `SessionExpired`, `WrongCredentials` — never
// for what it says, because what it says is the half that changes per locale.
// A string used by two or more areas moves up to `Common`, or to whichever
// area genuinely owns the concept: `Domains.Unknown` is reached from notes,
// cards, sessions and practice sets, and it is still a fact about domains.
//
// # A string with a value in it is a function
//
// Same rule as the frontend, same reason: calling it with the wrong number of
// arguments is a compile error, and a locale that formats numbers differently
// gets to do that in its own file. Never interpolate a raw int — Indonesian
// writes 5.000 where English writes 5,000, and 07 L8's quotas are in the
// thousands. Use `group` below.
//
// # Two mechanisms, not one (hard rule 9)
//
// The struct type is the first: both catalogs are the same type, so a field
// that exists in one and not the other is not expressible. That is weaker than
// TypeScript's `Copy`, because Go has a zero value — an unwritten field is not
// a compile error, it is `""` or a nil func, and it reaches a screen as a blank
// message nobody reports.
//
// `Missing` is the second mechanism, and `catalog_test.go` is what runs it over
// both catalogs, in both directions.
//
// # What does not belong here
//
//   - Anything the React app already has (`web/src/i18n`). The client renders
//     the server's `message` verbatim — see the comment in `ActiveSessions.tsx`
//     — so a string in both catalogs is a string that drifts.
//   - CLI output, `error` values and developer invariants. Those are
//     operator-facing and stay English by hard rule 8.
//   - Mail bodies. Those are parsed templates rather than strings and live in
//     `internal/mail/templates.go`, per locale, guarded by `Missing` there too.
//     Their *subjects* live with them for the same reason: a bilingual body
//     under an Indonesian subject is worse than either.
type Catalog struct {
	Common     CommonCopy
	Auth       AuthCopy
	Account    AccountCopy
	Notes      NotesCopy
	Cards      CardsCopy
	Domains    DomainsCopy
	Categories CategoriesCopy
	Review     ReviewCopy
	Sets       SetsCopy
	Sessions   SessionsCopy
	Settings   SettingsCopy
	Bulk       BulkCopy
	Quota      QuotaCopy
	Security   SecurityCopy
}

// CommonCopy holds the strings two or more areas genuinely share, plus the
// four the write helpers in `internal/api/errors.go` reach for.
//
// A string used by one area belongs to that area even when it looks generic.
// Moving it here "because it might be shared" is how a common namespace turns
// into a bag of words with no context for a translator.
type CommonCopy struct {
	// BadRequest is a body that would not decode. Deliberately says nothing
	// about *why*: the parser's complaint is developer detail (D-062).
	BadRequest string
	// NotFound is also the answer for a row owned by somebody else (D-039).
	// It must stay indistinguishable from a row that does not exist.
	NotFound string
	// ServerError is what an internal failure looks like from outside. The
	// cause is logged and never returned (D-062).
	ServerError string
	// ServerErrorWithCode is the same sentence plus the request id, so a
	// screenshot is actionable. The id is an opaque token — it identifies the
	// request, not the person (hard rule 10).
	//
	// A second leaf rather than a nil-check inside one, so neither locale has
	// to carry the branch and neither can get it wrong.
	ServerErrorWithCode func(requestID string) string
	// NotSignedIn is a request with no usable credential at all.
	NotSignedIn string
	// NotSignedInShort answers GET /auth/me, where "signed out" is a normal
	// state rather than a refusal, and the client treats it as one.
	NotSignedInShort string
	// SessionExpired is a credential that was real and no longer resolves.
	// Distinguished from NotSignedIn on purpose: telling somebody their
	// session expired when they never signed in is confusing.
	SessionExpired string
	// TooManyAttempts is the per-IP limiter on the signed-out routes.
	TooManyAttempts string
	// TooManyForAddress is the per-address limiter that sits on top of it, so
	// that many hosts cannot mailbomb one mailbox (07 L3).
	TooManyForAddress string
	// InvalidFilter is a query parameter that should hold uuids and does not.
	InvalidFilter string
	// BadColor guards both the domain and the category colour.
	BadColor string
}

type AuthCopy struct {
	CredentialsRequired string
	WrongCredentials    string
	// EmailNotVerified rides on CodeEmailUnverified, which is what turns a 403
	// into a "check your mail" screen with a working resend button.
	EmailNotVerified string
	// AccountSuspended is what a suspended account is told, wherever it is
	// told (ticket 10, O1). One string, because it is one fact.
	//
	// It takes the address rather than naming one, for the same reason the mail
	// templates take `baseURL` rather than naming an origin: the address is
	// deployment configuration, and D-096 makes self-hosting a real outcome
	// rather than a hypothetical. A hardcoded address would have every
	// self-hosted instance point its users at somebody else's inbox — and
	// would make changing it a copy change in two languages.
	//
	// It states the fact and where to ask, and it does not scold: a person
	// reading this may be here because somebody else's account was
	// compromised, or because the operator got it wrong (hard rule 6).
	AccountSuspended func(contact string) string
	InvalidEmail     string
	// PasswordTooShort names the minimum rather than saying "too short", and
	// takes it as an argument so the sentence cannot drift from the constant.
	PasswordTooShort        func(min int) string
	FirstNameRequired       string
	LastNameTooLong         string
	VerifyLinkExpired       string
	ResetLinkExpired        string
	CurrentPasswordRequired string
	// CurrentPasswordWrong says what did *not* happen. A refusal that leaves
	// somebody unsure whether their password changed is worse than the refusal.
	CurrentPasswordWrong string
	PasswordUnchanged    string
}

type AccountCopy struct {
	ConfirmWithPassword string
	// WrongPasswordNotDeleted, like CurrentPasswordWrong, says what did not
	// happen — this is the one irreversible endpoint (07 L7).
	WrongPasswordNotDeleted string
	ExportTooLarge          string
	TooManyExports          string
	TooManyDeleteAttempts   string
	TooManyPasswordChanges  string
}

type NotesCopy struct {
	TitleTooLong string
	BodyTooLong  string
}

type CardsCopy struct {
	FrontEmpty string
	BackEmpty  string
	TooLong    string
}

type DomainsCopy struct {
	// Unknown is reached from notes, cards, focus sessions and practice sets.
	// It lives here rather than in Common because it is a fact about domains
	// wherever it is said.
	Unknown         string
	NameTaken       string
	InUse           string
	NameEmpty       string
	NameTooLong     string
	BadWeeklyQuota  string
	TooManySelected string
}

type CategoriesCopy struct {
	Unknown         string
	NameTaken       string
	InUse           string
	NameEmpty       string
	NameTooLong     string
	NameInvalid     string
	TooManySelected string
}

type ReviewCopy struct {
	// BadRating is shared by the due queue and a practice run: one rating
	// vocabulary, one message. `ingat` and `lupa` are wire values, not copy,
	// and stay Indonesian in both catalogs.
	BadRating string
}

// SetsCopy is *latihan* — a saved practice set and one sitting of it. English
// calls it Practice; that pair is decided in `web/src/i18n/en.ts` and is not a
// per-string call.
type SetsCopy struct {
	AlreadyAttempted   string
	FixedOnly          string
	TooManyQuestions   string
	UnknownCard        string
	TitleEmpty         string
	TitleTooLong       string
	DescriptionTooLong string
	BadSelection       string
	BadFormat          string
	BadCount           string
	BadTimeLimit       string
	BadDate            string
	DateTooFarOff      string
	NoMatchingCards    string
	RunFinished        string
	ChooseAnAnswer     string
	UnknownChoice      string
}

// SessionsCopy is the focus timer's sessions, not the login sessions. Both
// exist and D-052 renamed a table to end exactly that ambiguity.
type SessionsCopy struct {
	BadDuration   string
	BadDate       string
	DateTooFarOff string
}

type SettingsCopy struct {
	BadDuration  func(min, max int) string
	BadFocusStep func(min, max int) string
	// BadLocale is a locale this build has no catalog for. 00014's CHECK
	// constraint enforces the same set (hard rule 9); this is the half that
	// produces a sentence rather than a constraint violation arriving as a
	// 500. The language names inside it are endonyms and stay untranslated.
	BadLocale string
}

type BulkCopy struct {
	NothingSelected string
	TooManySelected string
	// InvalidSelection is a malformed id in the list, not an id belonging to
	// somebody else — that one is scoped away in SQL and is simply not there.
	InvalidSelection string
}

// QuotaCopy names the limit rather than only refusing (07 L8). "Too many" with
// no number is a dead end: the reader cannot tell a bug from a bad request
// from a rule, and cannot act on any of the three.
type QuotaCopy struct {
	Notes  func(max int) string
	Cards  func(max int) string
	Writes func(perMinute int) string
}

type SecurityCopy struct {
	CrossSite string
	JSONOnly  string
}

// catalogs is every locale's copy, and the only place either is reachable
// from.
//
// A map rather than a switch so that adding a Locale to `Locales` without
// adding a catalog is caught by `TestEveryLocaleHasACatalog` rather than by a
// reader who happens to notice a missing case.
var catalogs = map[Locale]*Catalog{
	ID: &idCatalog,
	EN: &enCatalog,
}

// For returns the catalog for l, or the Indonesian one.
//
// It never returns nil, for the same reason FromContext never fails: a caller
// that has to nil-check before it can pick a sentence will eventually skip the
// check. A locale with no catalog cannot arrive through WithLocale, which
// validates; the fallback covers a direct call with a bad value.
func For(l Locale) *Catalog {
	if c, ok := catalogs[l]; ok {
		return c
	}
	return catalogs[Default]
}

// group formats an integer with a thousands separator.
//
// Indonesian writes 5.000 and English writes 5,000, and the 07 L8 quotas are
// 5.000 notes and 20.000 cards, so a bare strconv.Itoa is wrong in both
// languages. Each catalog file passes its own separator; there is no shared
// "default" because there is no locale-neutral answer.
//
// Not golang.org/x/text/message, which does this and a great deal more: D-065
// asks a dependency to name the production obligation it discharges, and
// "insert a separator every three digits" is not one.
func group(n int, sep string) string {
	s := strconv.Itoa(n)
	neg := ""
	if len(s) > 0 && s[0] == '-' {
		neg, s = "-", s[1:]
	}
	if len(s) <= 3 {
		return neg + s
	}
	var b []byte
	for i := 0; i < len(s); i++ {
		if i > 0 && (len(s)-i)%3 == 0 {
			b = append(b, sep...)
		}
		b = append(b, s[i])
	}
	return neg + string(b)
}
