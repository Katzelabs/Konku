package card

import (
	"crypto/rand"
	"fmt"
)

// idAlphabet omits look-alike characters (0/O, 1/l/I). These IDs end up
// visible in the markdown the user edits by hand, so they should be hard to
// mistype and easy to eyeball as "not prose".
const idAlphabet = "abcdefghijkmnpqrstuvwxyz23456789"

// idLength of 4 over a 32-character alphabet gives ~1M combinations. Cards
// are scoped per note, so collisions are checked against the note's existing
// IDs rather than trusted to be globally unique.
const idLength = 4

// NewID returns a short random card ID. taken lets the caller pass the IDs
// already present in the note so a fresh one never collides within it.
func NewID(taken map[string]bool) (string, error) {
	for attempt := 0; attempt < 100; attempt++ {
		id, err := randomID()
		if err != nil {
			return "", err
		}
		if !taken[id] {
			return id, nil
		}
	}
	return "", fmt.Errorf("card: could not find a free ID after 100 attempts")
}

func randomID() (string, error) {
	buf := make([]byte, idLength)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("card: reading random bytes: %w", err)
	}
	out := make([]byte, idLength)
	for i, b := range buf {
		out[i] = idAlphabet[int(b)%len(idAlphabet)]
	}
	return string(out), nil
}
