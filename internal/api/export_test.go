package api

// Hooks for the external api_test package.
//
// scrubEvent is the second of the two mechanisms keeping PII out of Sentry
// (hard rule 9), so it is worth testing directly rather than only through a
// live request — a direct test can attach everything a caller might and check
// that none of it survives.
var ScrubEventForTest = scrubEvent
