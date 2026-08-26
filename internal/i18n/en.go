package i18n

import "fmt"

// English — translated from `id.go`, which is the original.
//
// The same strings in the same order. Nothing added because an English sentence
// felt like it wanted one more word, and nothing dropped because it read
// awkwardly. If a line genuinely cannot be said this way in English, the fix is
// to change the Indonesian first and translate the new version — not to let the
// two catalogs say different things.
//
// # Read this before you translate anything
//
// **Never punitive** (hard rule 6) survives translation only if somebody is
// watching, and English is where it fails. English has a far larger vocabulary
// of gentle blame than Indonesian does, and every phrase in it sounds friendly:
//
//   - No *don't forget*, *remember to*, *make sure you*.
//   - No *you missed*, *you forgot*, *you should have*, *overdue*.
//   - No *oops*, *uh oh*, *sorry!*, no exclamation marks.
//   - No urgency: nothing *expires*, nothing is *running out*.
//
// This whole catalog is refusals, which is the hardest place to hold that line:
// a refusal that scolds reads as ordinary firmness. State what happened, then
// what to do. "Ask for a new one." — not "Your link expired, you'll have to
// request another!".
//
// `catalog_test.go` fails on the phrases above. It catches the ones that keep
// reappearing, and it is not a substitute for reading this paragraph — there
// are more ways to blame someone in English than a test can list.
//
// # Style
//
// Plain, direct, active voice, sentence case, no filler. Say *you*, never *the
// user*. Prefer the short word: *use*, not *utilise*; *end*, not *terminate*.
// British spelling, matching the rest of the repo: *colour*.
//
// # Vocabulary — decided, do not relitigate
//
//	Ulangan  → Review
//	Latihan  → Practice
//	Terhapus → Deleted
//
// The operator's decision, recorded in `web/src/i18n/en.ts`. These are product
// vocabulary rather than strings, and they are not a per-string call.
//
// `ingat` and `lupa` are neither: they are the wire values of a rating, like
// `fixed` and `random`, and they stay as they are in both languages.

// comma is the English thousands separator: 5,000, not 5.000.
const comma = ","

var enCatalog = Catalog{
	Common: CommonCopy{
		BadRequest:  "That request is not valid.",
		NotFound:    "Not found.",
		ServerError: "Something went wrong on the server. Try again in a moment.",
		ServerErrorWithCode: func(requestID string) string {
			return "Something went wrong on the server. Try again in a moment. Code: " + requestID
		},
		NotSignedIn:       "You are not signed in.",
		NotSignedInShort:  "Not signed in.",
		SessionExpired:    "Your session has ended. Sign in again.",
		TooManyAttempts:   "Too many attempts. Try again in a few minutes.",
		TooManyForAddress: "Too many attempts for this address. Try again in a few minutes.",
		InvalidFilter:     "That filter is not valid.",
		BadColor:          "Colour must be in #RRGGBB format.",
	},

	Auth: AuthCopy{
		CredentialsRequired: "Email and password are both required.",
		WrongCredentials:    "That email or password is wrong.",
		EmailNotVerified:    "Verify your email address first. The link is in your inbox.",
		AccountSuspended: func(contact string) string {
			return fmt.Sprintf(
				"This account is suspended. Contact %s if you have questions.", contact)
		},
		InvalidEmail: "That email address is not valid.",
		PasswordTooShort: func(min int) string {
			return fmt.Sprintf(
				"A password needs at least %d characters. "+
					"A long phrase is both safer and easier to recall.", min)
		},
		FirstNameRequired:       "First name is required.",
		LastNameTooLong:         "That last name is too long.",
		VerifyLinkExpired:       "This verification link no longer works. Ask for a new one.",
		ResetLinkExpired:        "This link no longer works. Ask for a new one.",
		CurrentPasswordRequired: "Enter your current password.",
		CurrentPasswordWrong:    "That current password is wrong. Your password is unchanged.",
		PasswordUnchanged:       "The new password is the same as the old one. Pick a different one.",
	},

	Account: AccountCopy{
		ConfirmWithPassword:     "Enter your password to confirm.",
		WrongPasswordNotDeleted: "That password is wrong. Your account was not deleted.",
		ExportTooLarge: "Your archive is too large to build in one go. " +
			"Contact the operator so the export can be split.",
		TooManyExports: "Too many export requests. Try again in an hour — " +
			"an archive you have already downloaded is still complete.",
		TooManyDeleteAttempts:  "Too many account deletion attempts. Try again in an hour.",
		TooManyPasswordChanges: "Too many password change attempts. Try again in an hour.",
	},

	Notes: NotesCopy{
		TitleTooLong: "That title is too long.",
		BodyTooLong:  "That note is too long.",
	},

	Cards: CardsCopy{
		FrontEmpty: "The question cannot be empty.",
		BackEmpty:  "The answer cannot be empty.",
		TooLong:    "That card is too long.",
	},

	Domains: DomainsCopy{
		Unknown:         "Unknown domain.",
		NameTaken:       "A domain with that name already exists.",
		InUse:           "Notes or sessions still use this domain. Archive it instead.",
		NameEmpty:       "A domain name cannot be empty.",
		NameTooLong:     "That domain name is too long.",
		BadWeeklyQuota:  "That weekly target does not make sense.",
		TooManySelected: "Too many domains.",
	},

	Categories: CategoriesCopy{
		Unknown:         "Unknown category.",
		NameTaken:       "A category with that name already exists.",
		InUse:           "This category is still in use. Archive it if you no longer need it.",
		NameEmpty:       "A category name cannot be empty.",
		NameTooLong:     "That category name is too long.",
		NameInvalid:     "That category name is not valid.",
		TooManySelected: "Too many categories.",
	},

	Review: ReviewCopy{
		BadRating: "Rating must be 'ingat' or 'lupa'.",
	},

	Sets: SetsCopy{
		AlreadyAttempted:   "This practice set has already been done. Archive it instead.",
		FixedOnly:          "Only a practice set with fixed questions has a card list.",
		TooManyQuestions:   "Too many questions.",
		UnknownCard:        "One of the cards is unknown.",
		TitleEmpty:         "A practice title cannot be empty.",
		TitleTooLong:       "That practice title is too long.",
		DescriptionTooLong: "That practice description is too long.",
		BadSelection:       "Question type must be 'fixed' or 'random'.",
		BadFormat:          "Question format must be 'recall' or 'choice'.",
		BadCount:           "That number of questions does not make sense.",
		BadTimeLimit:       "That time limit does not make sense.",
		BadDate:            "That date is not valid.",
		DateTooFarOff:      "That date is too far from today. Check the clock on your device.",
		NoMatchingCards: "No cards match this filter yet. " +
			"Loosen the filter, or write some cards first.",
		RunFinished:    "This practice is already finished.",
		ChooseAnAnswer: "Pick one of the answers.",
		UnknownChoice:  "Unknown choice.",
	},

	Sessions: SessionsCopy{
		BadDuration:   "That session length does not make sense.",
		BadDate:       "That session date is not valid.",
		DateTooFarOff: "That session date is too far from today. Check the clock on your device.",
	},

	Settings: SettingsCopy{
		BadDuration: func(min, max int) string {
			return fmt.Sprintf("The default length must be between %d and %d minutes.", min, max)
		},
		BadFocusStep: func(min, max int) string {
			return fmt.Sprintf("Progressive focus must be between %d and %d.", min, max)
		},
		BadLocale: "That language is not available yet. Choose Bahasa Indonesia or English.",
	},

	Bulk: BulkCopy{
		NothingSelected:  "Nothing is selected.",
		TooManySelected:  "Too many selected at once.",
		InvalidSelection: "That selection is not valid.",
	},

	Quota: QuotaCopy{
		Notes: func(max int) string {
			return fmt.Sprintf(
				"You have %s notes, the maximum for one account. "+
					"Delete some you no longer use to write more.", group(max, comma))
		},
		Cards: func(max int) string {
			return fmt.Sprintf(
				"You have %s cards, the maximum for one account. "+
					"Delete some you no longer use to make more.", group(max, comma))
		},
		Writes: func(perMinute int) string {
			return fmt.Sprintf(
				"Too many changes in a short time — the limit is %s per minute. "+
					"Wait a moment, then try again.", group(perMinute, comma))
		},
	},

	Security: SecurityCopy{
		CrossSite: "That request was refused because it came from another site.",
		JSONOnly:  "The request must be JSON.",
	},
}
