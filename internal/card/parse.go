package card

import (
	"fmt"
	"regexp"
	"strings"
)

// separator splits a basic card's front from its back. Two colons rather than
// one because a single colon appears constantly in ordinary prose.
const separator = "::"

// idAnywhere matches a stable-ID marker wherever it appears, including inside
// a fenced code block. The alphabet is deliberately looser than idAlphabet:
// reading an ID must keep working if the alphabet ever changes, because a
// marker that stops being recognised is a card that loses its history.
var idAnywhere = regexp.MustCompile(`<!--\s*c:([A-Za-z0-9]+)\s*-->`)

// idTrailing is the same marker anchored to the end of a line, which is the
// only position that claims the line's card.
var idTrailing = regexp.MustCompile(`<!--\s*c:([A-Za-z0-9]+)\s*-->[ \t]*$`)

// Parse extracts cards from note markdown.
//
// Any card without a trailing `<!-- c:xxxx -->` comment is new: Parse assigns
// it an ID and returns markdown with that ID written in. The caller persists
// the returned markdown alongside the cards, in one transaction, so the note
// and its card rows can never disagree.
//
// Parse is a fixed point: feeding its output back in returns that output
// unchanged. Every save runs through here, so a Parse that kept rewriting the
// document would turn every save into a diff and make the git vault export
// (v0.2) unreadable.
//
// The MVP recognises `Q :: A` only. Cloze and feynman syntax is left strictly
// alone rather than rejected (D-031) — a user who writes `{{...}}` today loses
// nothing when v0.2 starts parsing it, and any ID already sitting on such a
// line is honoured so a basic card can never be handed the same one.
//
// See docs/TECH.md §4 and D-019.
func Parse(markdown string) (cards []Card, updated string, err error) {
	lines := strings.Split(markdown, "\n")

	// Every ID present anywhere in the document, fenced examples included.
	// Deliberately conservative: an ID inside a code block is not a card
	// today, but handing the same one to a real card would make it become a
	// duplicate the moment the fence is removed.
	taken := collectIDs(markdown)

	// IDs already claimed by a line outside a fence. A second line claiming
	// the same ID is a corrupt document — see the duplicate handling below.
	seen := make(map[string]bool, len(taken))

	out := make([]string, len(lines))
	var fence fenceState

	for i, raw := range lines {
		out[i] = raw

		body, cr := splitCR(raw)
		if fence.track(body) {
			continue // the fence delimiters and everything between them
		}

		id, rest := splitTrailingID(body)
		front, back, ok := splitCard(rest)
		if !ok {
			continue // prose, or a cloze/feynman line the MVP does not read
		}

		// A missing ID means a new card. A repeated ID means two lines are
		// claiming one card's history: the first keeps it and the second is
		// treated as new, because the alternative is one line silently
		// overwriting the other on every save.
		if id == "" || seen[id] {
			fresh, ferr := NewID(taken)
			if ferr != nil {
				return nil, markdown, fmt.Errorf("card: assigning an ID on line %d: %w", i+1, ferr)
			}
			taken[fresh] = true
			id = fresh
			out[i] = strings.TrimRight(rest, " \t") + " <!-- c:" + id + " -->" + cr
		}
		seen[id] = true

		cards = append(cards, Card{
			ID:    id,
			Type:  TypeBasic,
			Front: front,
			Back:  back,
			Line:  i,
		})
	}

	return cards, strings.Join(out, "\n"), nil
}

// Insert renders a card into markdown, appending it with a freshly assigned
// ID, and returns the updated document.
//
// This is the write half of the chokepoint (D-033). In v0.3 the MCP tool
// add_card is a thin wrapper over this, so an agent adding a card and a user
// typing `::` by hand converge on identical output.
//
// Insert only appends. Existing card IDs in the document are never rewritten,
// so calling it can never disturb another card's review history.
func Insert(markdown string, c Card) (updated string, id string, err error) {
	if c.Type != "" && c.Type != TypeBasic {
		return markdown, "", fmt.Errorf("card: Insert supports %s only, got %q", TypeBasic, c.Type)
	}

	front := strings.TrimSpace(c.Front)
	back := strings.TrimSpace(c.Back)
	if front == "" || back == "" {
		return markdown, "", fmt.Errorf("card: a card needs a non-empty front and back")
	}
	if strings.ContainsAny(front, "\r\n") || strings.ContainsAny(back, "\r\n") {
		return markdown, "", fmt.Errorf("card: a card is one line; front and back cannot contain a newline")
	}
	// Parse splits on the first separator, so a front containing one would
	// read back with a shorter front and a longer back.
	if findSeparator(front) >= 0 {
		return markdown, "", fmt.Errorf("card: front cannot contain %q", separator)
	}

	id, err = NewID(collectIDs(markdown))
	if err != nil {
		return markdown, "", err
	}

	line := front + " " + separator + " " + back + " <!-- c:" + id + " -->"

	// Insert and Parse are inverses, and that is a property worth checking
	// rather than assuming: stray backticks in the text can open an inline
	// code span that swallows the separator. Better to refuse the card than
	// to write a line the parser will not read back.
	if !roundTrips(line, id, front, back) {
		return markdown, "", fmt.Errorf("card: %q would not read back as a card; check for unbalanced backticks", line)
	}

	body := strings.TrimRight(markdown, " \t\r\n")
	if body == "" {
		return line + "\n", id, nil
	}
	// A blank line before it: appended straight onto the previous line the
	// card would join that paragraph when rendered.
	return body + "\n\n" + line + "\n", id, nil
}

func roundTrips(line, id, front, back string) bool {
	got, updated, err := Parse(line)
	if err != nil || updated != line || len(got) != 1 {
		return false
	}
	return got[0].ID == id && got[0].Front == front && got[0].Back == back
}

// collectIDs returns every card ID the document mentions.
func collectIDs(markdown string) map[string]bool {
	out := make(map[string]bool)
	for _, m := range idAnywhere.FindAllStringSubmatch(markdown, -1) {
		out[m[1]] = true
	}
	return out
}

// splitCR separates a trailing carriage return so CRLF documents survive a
// round-trip byte for byte.
func splitCR(line string) (body, cr string) {
	if strings.HasSuffix(line, "\r") {
		return line[:len(line)-1], "\r"
	}
	return line, ""
}

// splitTrailingID peels the stable-ID marker off the end of a line and
// returns it with the text that precedes it.
func splitTrailingID(line string) (id, rest string) {
	m := idTrailing.FindStringSubmatchIndex(line)
	if m == nil {
		return "", line
	}
	return line[m[2]:m[3]], line[:m[0]]
}

// splitCard reads a `front :: back` line. Both sides must carry text: a line
// that is only a separator, or a heading like `Bab 3 ::`, is prose.
func splitCard(s string) (front, back string, ok bool) {
	i := findSeparator(s)
	if i < 0 {
		return "", "", false
	}
	front = strings.TrimSpace(s[:i])
	back = strings.TrimSpace(s[i+len(separator):])
	if front == "" || back == "" {
		return "", "", false
	}
	return front, back, true
}

// findSeparator returns the byte offset of the first separator outside an
// inline code span, or -1. Code spans are skipped because `a :: b` inside
// backticks is documentation of the syntax, not a use of it.
func findSeparator(s string) int {
	for i := 0; i < len(s); {
		switch s[i] {
		case '`':
			n := runLength(s, i, '`')
			end := closingRun(s, i+n, '`', n)
			if end < 0 {
				// An unmatched run is literal text, not a span.
				i += n
				continue
			}
			i = end + n
		case ':':
			if strings.HasPrefix(s[i:], separator) {
				return i
			}
			i++
		default:
			i++
		}
	}
	return -1
}

// runLength counts the consecutive ch starting at i.
func runLength(s string, i int, ch byte) int {
	n := 0
	for i+n < len(s) && s[i+n] == ch {
		n++
	}
	return n
}

// closingRun finds the offset of the next run of exactly n ch at or after
// from, which is what closes a code span of that width.
func closingRun(s string, from int, ch byte, n int) int {
	for i := from; i < len(s); {
		if s[i] != ch {
			i++
			continue
		}
		got := runLength(s, i, ch)
		if got == n {
			return i
		}
		i += got
	}
	return -1
}

// fenceState tracks fenced code blocks across lines.
type fenceState struct {
	open bool
	char byte
	size int
}

// track advances the state by one line and reports whether that line belongs
// to a fenced code block, delimiters included.
func (f *fenceState) track(line string) bool {
	char, size, bare := fenceDelimiter(line)

	if f.open {
		// Only a bare run of the same character, at least as long as the
		// opener, closes it — otherwise ``` inside a ~~~ block would end it.
		if size > 0 && char == f.char && size >= f.size && bare {
			f.open = false
		}
		return true
	}

	if size > 0 {
		f.open, f.char, f.size = true, char, size
		return true
	}
	return false
}

// fenceDelimiter reports the fence character and run length of a fence line,
// or a zero size if the line is not one. bare is true when nothing but
// whitespace follows the run, which is what a closing fence requires.
func fenceDelimiter(line string) (char byte, size int, bare bool) {
	i := 0
	for i < len(line) && line[i] == ' ' {
		i++
	}
	if i > 3 || i >= len(line) { // four spaces is an indented code block
		return 0, 0, false
	}
	if line[i] != '`' && line[i] != '~' {
		return 0, 0, false
	}

	char = line[i]
	size = runLength(line, i, char)
	if size < 3 {
		return 0, 0, false
	}
	return char, size, strings.TrimSpace(line[i+size:]) == ""
}
