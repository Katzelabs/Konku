// Package card parses flashcards out of note markdown and renders them back
// into it.
//
// PURE: this package imports nothing from internal/. No database, no HTTP.
// It owns both directions (D-033) — Parse reads cards out, Insert writes one
// in — so the UI, the API and (in v0.3) the MCP server all mutate cards
// through one chokepoint and cannot drift apart.
//
// # Syntax
//
// Cards live inline in the note body. The MVP supports basic only; cloze and
// feynman arrive in v0.2 (D-031).
//
//	Apa itu prior? :: Keyakinan awal sebelum melihat data   <!-- c:k3n8 -->
//	Rumus Bayes adalah {{P(B|A)·P(A) / P(B)}}               <!-- c:m2p1 -->
//	> [!feynman] Jelaskan kenapa Bayes berguna              <!-- c:x9f4 -->
//
// # Why the trailing comment matters
//
// Each card carries a stable ID embedded in the markdown. Sync matches cards
// by that ID and never by content, because matching by content means fixing a
// typo destroys the card's review history and resets its schedule (D-019).
// Parse assigns IDs to new cards and the caller writes the updated markdown
// back to the note.
package card

// Type is the card format. Only TypeBasic is parsed in the MVP.
type Type string

const (
	TypeBasic   Type = "basic"   // Question :: Answer
	TypeCloze   Type = "cloze"   // text with a {{blank}}       — v0.2
	TypeFeynman Type = "feynman" // > [!feynman] Explain X      — v0.2
)

// Card is one flashcard extracted from a note.
type Card struct {
	// ID is stable across edits and is persisted in the markdown itself.
	ID   string
	Type Type
	// Front is the prompt shown before reveal. Never send Back to the
	// client alongside it — recall before reveal is mandatory (D-003).
	Front string
	Back  string
	// Line is the 0-based line in the source markdown, for error messages
	// and for linking a failed review back to its place in the note.
	Line int
}
