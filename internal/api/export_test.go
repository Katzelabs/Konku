package api

// Hooks for the external api_test package.
//
// scrubEvent is the second of the two mechanisms keeping PII out of Sentry
// (hard rule 9), so it is worth testing directly rather than only through a
// live request — a direct test can attach everything a caller might and check
// that none of it survives.
var ScrubEventForTest = scrubEvent

// The per-route budgets from quota.go, so the 429 tests assert against the real
// numbers rather than literals that drift the moment either is tuned.
const (
	MaxAccountDeletesForTest  = maxAccountDeletes
	MaxExportsForTest         = maxExports
	MaxPasswordChangesForTest = maxPasswordChanges

	// The client-error budget (F-03), for the same reason.
	MaxClientErrorsForTest = maxClientErrorsPerHour
)

// The two sanitisers on the client-error path. Both are the second half of a
// guarantee the browser also makes (hard rule 9), so both are worth a direct
// table test rather than only the one case a live request happens to send.
var (
	SanitizeClientRouteForTest = sanitizeClientRoute
	TruncateRunesForTest       = truncateRunes
)
