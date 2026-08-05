package card

// Parse extracts cards from note markdown.
//
// Any card without a trailing `<!-- c:xxxx -->` comment is new: Parse assigns
// it an ID and returns markdown with that ID written in. The caller persists
// the returned markdown alongside the cards, in one transaction, so the note
// and its card rows can never disagree.
//
// TODO(MVP): implement basic `Q :: A` only. Table-driven tests must cover:
//   - a new card gets an ID written back into the markdown
//   - an existing ID is preserved verbatim when its text is edited
//   - `::` inside a fenced code block is not a card
//   - `::` inside inline code is not a card
//   - a line with several `::` splits on the first one only
//   - empty front or empty back is not a card
//   - IDs are unique within a note
//
// See docs/TECH.md §4 and D-019.
func Parse(markdown string) (cards []Card, updated string, err error) {
	return nil, markdown, nil
}

// Insert renders a card into markdown, appending it with a freshly assigned
// ID, and returns the updated document.
//
// This is the write half of the chokepoint (D-033). In v0.3 the MCP tool
// add_card is a thin wrapper over this, so an agent adding a card and a user
// typing `::` by hand converge on identical output.
//
// TODO(MVP): implement for TypeBasic.
func Insert(markdown string, c Card) (updated string, id string, err error) {
	return markdown, "", nil
}
