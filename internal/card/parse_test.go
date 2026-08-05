package card

import (
	"regexp"
	"strings"
	"testing"
)

// anyID matches the ID inside a marker but not the marker itself, so masking
// lets a table say where an ID belongs without knowing which random one was
// drawn, while still asserting the marker's own spacing.
var anyID = regexp.MustCompile(`c:[A-Za-z0-9]+`)

func maskID(s string) string { return anyID.ReplaceAllString(s, "c:ID") }

// idsInOrder returns the card IDs of a document in the order they appear.
func idsInOrder(s string) []string {
	var out []string
	for _, m := range idAnywhere.FindAllStringSubmatch(s, -1) {
		out = append(out, m[1])
	}
	return out
}

func TestParse(t *testing.T) {
	tests := []struct {
		name string
		md   string
		// want is the markdown Parse should return, with every card ID
		// written as the placeholder `<!-- c:ID -->`.
		want  string
		cards []Card
	}{
		{
			name: "new card gets an ID written back into the markdown",
			md:   "Apa itu prior? :: Keyakinan awal sebelum melihat data",
			want: "Apa itu prior? :: Keyakinan awal sebelum melihat data <!-- c:ID -->",
			cards: []Card{
				{Type: TypeBasic, Front: "Apa itu prior?", Back: "Keyakinan awal sebelum melihat data", Line: 0},
			},
		},
		{
			name:  "an existing ID is left where it is",
			md:    "Apa itu prior? :: Keyakinan awal <!-- c:k3n8 -->",
			want:  "Apa itu prior? :: Keyakinan awal <!-- c:ID -->",
			cards: []Card{{ID: "k3n8", Type: TypeBasic, Front: "Apa itu prior?", Back: "Keyakinan awal", Line: 0}},
		},
		{
			name: "prose is not a card",
			md:   "# Teorema Bayes\n\nP(A|B) = P(B|A)P(A) / P(B)\n",
			want: "# Teorema Bayes\n\nP(A|B) = P(B|A)P(A) / P(B)\n",
		},
		{
			name: "a single colon is not a separator",
			md:   "Catatan: ini bukan kartu",
			want: "Catatan: ini bukan kartu",
		},
		{
			name: ":: inside a fenced code block is not a card",
			md:   "Contoh sintaks:\n\n```markdown\nApa itu prior? :: Keyakinan awal\n```\n\nselesai\n",
			want: "Contoh sintaks:\n\n```markdown\nApa itu prior? :: Keyakinan awal\n```\n\nselesai\n",
		},
		{
			name: "a tilde fence also hides cards",
			md:   "~~~\nq :: a\n~~~\n",
			want: "~~~\nq :: a\n~~~\n",
		},
		{
			name: "a backtick run inside a tilde fence does not close it",
			md:   "~~~\n```\nq :: a\n```\n~~~\n",
			want: "~~~\n```\nq :: a\n```\n~~~\n",
		},
		{
			name: "an unclosed fence hides everything after it",
			md:   "```\nq :: a\n",
			want: "```\nq :: a\n",
		},
		{
			name: "a card after a closed fence is still a card",
			md:   "```go\nx := 1\n```\nApa itu x? :: Sebuah variabel",
			want: "```go\nx := 1\n```\nApa itu x? :: Sebuah variabel <!-- c:ID -->",
			cards: []Card{
				{Type: TypeBasic, Front: "Apa itu x?", Back: "Sebuah variabel", Line: 3},
			},
		},
		{
			name: ":: inside inline backticks is not a card",
			md:   "Sintaksnya adalah `depan :: belakang`",
			want: "Sintaksnya adalah `depan :: belakang`",
		},
		{
			name: "a separator outside backticks still counts",
			md:   "Sintaks kartu :: ditulis `depan :: belakang`",
			want: "Sintaks kartu :: ditulis `depan :: belakang` <!-- c:ID -->",
			cards: []Card{
				{Type: TypeBasic, Front: "Sintaks kartu", Back: "ditulis `depan :: belakang`", Line: 0},
			},
		},
		{
			name: "an unmatched backtick is literal text, not a code span",
			md:   "Nilai `x :: sebuah variabel",
			want: "Nilai `x :: sebuah variabel <!-- c:ID -->",
			cards: []Card{
				{Type: TypeBasic, Front: "Nilai `x", Back: "sebuah variabel", Line: 0},
			},
		},
		{
			name: "several separators on one line split on the first only",
			md:   "a :: b :: c",
			want: "a :: b :: c <!-- c:ID -->",
			cards: []Card{
				{Type: TypeBasic, Front: "a", Back: "b :: c", Line: 0},
			},
		},
		{
			name: "an empty front is not a card",
			md:   ":: hanya jawaban",
			want: ":: hanya jawaban",
		},
		{
			name: "an empty back is not a card",
			md:   "hanya pertanyaan ::",
			want: "hanya pertanyaan ::",
		},
		{
			name: "a whitespace-only back is not a card",
			md:   "hanya pertanyaan ::   ",
			want: "hanya pertanyaan ::   ",
		},
		{
			name: "cloze syntax is ignored, not rejected",
			md:   "Rumus Bayes adalah {{P(B|A)P(A) / P(B)}} <!-- c:m2p1 -->",
			want: "Rumus Bayes adalah {{P(B|A)P(A) / P(B)}} <!-- c:ID -->",
		},
		{
			name: "feynman syntax is ignored, not rejected",
			md:   "> [!feynman] Jelaskan kenapa Bayes berguna <!-- c:x9f4 -->",
			want: "> [!feynman] Jelaskan kenapa Bayes berguna <!-- c:ID -->",
		},
		{
			name: "two new cards in one note",
			md:   "q1 :: a1\n\nq2 :: a2\n",
			want: "q1 :: a1 <!-- c:ID -->\n\nq2 :: a2 <!-- c:ID -->\n",
			cards: []Card{
				{Type: TypeBasic, Front: "q1", Back: "a1", Line: 0},
				{Type: TypeBasic, Front: "q2", Back: "a2", Line: 2},
			},
		},
		{
			name: "a new card alongside an existing one",
			md:   "q1 :: a1 <!-- c:k3n8 -->\nq2 :: a2\n",
			want: "q1 :: a1 <!-- c:ID -->\nq2 :: a2 <!-- c:ID -->\n",
			cards: []Card{
				{ID: "k3n8", Type: TypeBasic, Front: "q1", Back: "a1", Line: 0},
				{Type: TypeBasic, Front: "q2", Back: "a2", Line: 1},
			},
		},
		{
			name: "trailing whitespace is trimmed when the ID is appended",
			md:   "q :: a   ",
			want: "q :: a <!-- c:ID -->",
			cards: []Card{
				{Type: TypeBasic, Front: "q", Back: "a", Line: 0},
			},
		},
		{
			name: "a marker with odd spacing is still recognised",
			md:   "q :: a <!--   c:k3n8   -->",
			want: "q :: a <!--   c:ID   -->",
			cards: []Card{
				{ID: "k3n8", Type: TypeBasic, Front: "q", Back: "a", Line: 0},
			},
		},
		{
			name:  "an empty document parses to nothing",
			md:    "",
			want:  "",
			cards: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cards, updated, err := Parse(tt.md)
			if err != nil {
				t.Fatalf("Parse: %v", err)
			}

			if got := maskID(updated); got != maskID(tt.want) {
				t.Errorf("markdown:\n got %q\nwant %q", got, tt.want)
			}

			if len(cards) != len(tt.cards) {
				t.Fatalf("got %d cards, want %d: %+v", len(cards), len(tt.cards), cards)
			}
			for i, want := range tt.cards {
				got := cards[i]
				if want.ID != "" && got.ID != want.ID {
					t.Errorf("card %d: ID = %q, want %q", i, got.ID, want.ID)
				}
				if got.ID == "" {
					t.Errorf("card %d: no ID assigned", i)
				}
				if got.Type != want.Type || got.Front != want.Front || got.Back != want.Back || got.Line != want.Line {
					t.Errorf("card %d:\n got %+v\nwant %+v", i, got, want)
				}
			}
		})
	}
}

// TestParseIsAFixedPoint is the property that matters most. Every save runs
// through Parse; if it kept rewriting the document, every save would produce a
// diff and the git vault export would be noise.
func TestParseIsAFixedPoint(t *testing.T) {
	docs := []string{
		"",
		"q :: a",
		"q1 :: a1\n\nq2 :: a2\n",
		"# Judul\n\nprosa biasa\n\nq :: a <!-- c:k3n8 -->\n\n```\nq :: a\n```\n",
		"q :: a   \n",
		"q :: a\r\nq2 :: a2\r\n",
	}

	for _, md := range docs {
		t.Run(strings.ReplaceAll(md, "\n", "|"), func(t *testing.T) {
			_, once, err := Parse(md)
			if err != nil {
				t.Fatalf("first Parse: %v", err)
			}
			_, twice, err := Parse(once)
			if err != nil {
				t.Fatalf("second Parse: %v", err)
			}
			if once != twice {
				t.Errorf("Parse is not a fixed point:\nfirst  %q\nsecond %q", once, twice)
			}
		})
	}
}

// TestExistingIDSurvivesAnEdit is the whole reason IDs are in the markdown.
// If an edit reassigns the ID, sync sees a delete plus an insert and the
// card's review history is gone — silently (D-019).
func TestExistingIDSurvivesAnEdit(t *testing.T) {
	before := "Apa itu prior? :: Keyakinan awal <!-- c:k3n8 -->\n"
	after := "Apa itu prior (probabilitas)? :: Keyakinan awal sebelum melihat data <!-- c:k3n8 -->\n"

	cards, updated, err := Parse(after)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if updated != after {
		t.Errorf("markdown was rewritten:\n got %q\nwant %q", updated, after)
	}
	if len(cards) != 1 {
		t.Fatalf("got %d cards, want 1", len(cards))
	}
	if cards[0].ID != "k3n8" {
		t.Fatalf("ID = %q, want k3n8 — editing a card's text must not change its ID", cards[0].ID)
	}

	// And the ID is the same one the unedited document carried.
	old, _, _ := Parse(before)
	if old[0].ID != cards[0].ID {
		t.Fatalf("ID changed across an edit: %q then %q", old[0].ID, cards[0].ID)
	}
}

// TestNewIDsAreDistinct: two new cards in one note must not collide, and a new
// card must not be handed an ID already used elsewhere in the document —
// including one sitting on a cloze line the MVP does not parse.
func TestNewIDsAreDistinct(t *testing.T) {
	md := "q1 :: a1\nq2 :: a2\nq3 :: a3\n{{cloze}} <!-- c:m2p1 -->\n"

	cards, updated, err := Parse(md)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(cards) != 3 {
		t.Fatalf("got %d cards, want 3", len(cards))
	}

	seen := map[string]bool{}
	for _, id := range idsInOrder(updated) {
		if seen[id] {
			t.Fatalf("duplicate ID %q in %q", id, updated)
		}
		seen[id] = true
	}
	if !seen["m2p1"] {
		t.Error("the cloze line's ID was rewritten; unparsed syntax must be left alone")
	}
}

// TestDuplicateIDIsReassigned: two lines claiming one ID is a corrupt
// document. The first keeps the history; the second becomes a new card rather
// than silently overwriting the first on every save.
func TestDuplicateIDIsReassigned(t *testing.T) {
	md := "q1 :: a1 <!-- c:k3n8 -->\nq2 :: a2 <!-- c:k3n8 -->\n"

	cards, updated, err := Parse(md)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(cards) != 2 {
		t.Fatalf("got %d cards, want 2", len(cards))
	}
	if cards[0].ID != "k3n8" {
		t.Errorf("first card ID = %q, want k3n8 — the first claim keeps the history", cards[0].ID)
	}
	if cards[1].ID == "k3n8" {
		t.Error("the second card kept the duplicate ID")
	}

	// And the repair is stable: parsing again changes nothing further.
	_, again, err := Parse(updated)
	if err != nil {
		t.Fatalf("re-Parse: %v", err)
	}
	if again != updated {
		t.Errorf("the repair is not a fixed point:\n got %q\nwant %q", again, updated)
	}
}

// TestRemovedCardIsAbsent: deleting the line removes the card from the parse
// results. The caller soft-deletes it, so its review history survives.
func TestRemovedCardIsAbsent(t *testing.T) {
	md := "q1 :: a1 <!-- c:k3n8 -->\nq2 :: a2 <!-- c:m2p1 -->\n"
	cards, _, err := Parse(md)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(cards) != 2 {
		t.Fatalf("got %d cards, want 2", len(cards))
	}

	cards, _, err = Parse("q1 :: a1 <!-- c:k3n8 -->\n")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(cards) != 1 || cards[0].ID != "k3n8" {
		t.Fatalf("got %+v, want only k3n8", cards)
	}
}

func TestInsert(t *testing.T) {
	t.Run("round-trips through Parse", func(t *testing.T) {
		want := Card{Type: TypeBasic, Front: "Apa itu prior?", Back: "Keyakinan awal sebelum melihat data"}

		updated, id, err := Insert("# Teorema Bayes\n\nprosa\n", want)
		if err != nil {
			t.Fatalf("Insert: %v", err)
		}
		if id == "" {
			t.Fatal("Insert assigned no ID")
		}

		cards, reparsed, err := Parse(updated)
		if err != nil {
			t.Fatalf("Parse: %v", err)
		}
		if reparsed != updated {
			t.Errorf("Parse rewrote what Insert wrote:\n got %q\nwant %q", reparsed, updated)
		}
		if len(cards) != 1 {
			t.Fatalf("got %d cards, want 1: %q", len(cards), updated)
		}
		got := cards[0]
		if got.ID != id || got.Front != want.Front || got.Back != want.Back || got.Type != TypeBasic {
			t.Errorf("round-trip lost data:\n got %+v\nwant %+v with ID %q", got, want, id)
		}
	})

	t.Run("keeps existing cards untouched", func(t *testing.T) {
		md := "q1 :: a1 <!-- c:k3n8 -->\n"
		updated, id, err := Insert(md, Card{Front: "q2", Back: "a2"})
		if err != nil {
			t.Fatalf("Insert: %v", err)
		}
		if !strings.Contains(updated, "q1 :: a1 <!-- c:k3n8 -->") {
			t.Errorf("the existing card line was rewritten: %q", updated)
		}
		if id == "k3n8" {
			t.Error("Insert reused an ID already in the document")
		}

		cards, _, _ := Parse(updated)
		if len(cards) != 2 {
			t.Fatalf("got %d cards, want 2: %q", len(cards), updated)
		}
	})

	t.Run("into an empty document", func(t *testing.T) {
		updated, _, err := Insert("", Card{Front: "q", Back: "a"})
		if err != nil {
			t.Fatalf("Insert: %v", err)
		}
		if strings.HasPrefix(updated, "\n") {
			t.Errorf("leading blank line: %q", updated)
		}
		cards, _, _ := Parse(updated)
		if len(cards) != 1 {
			t.Fatalf("got %d cards, want 1: %q", len(cards), updated)
		}
	})

	t.Run("a card is separated from the prose above it", func(t *testing.T) {
		updated, _, err := Insert("sebuah paragraf", Card{Front: "q", Back: "a"})
		if err != nil {
			t.Fatalf("Insert: %v", err)
		}
		if !strings.Contains(updated, "paragraf\n\nq :: a") {
			t.Errorf("card was glued to the paragraph above: %q", updated)
		}
	})

	t.Run("rejects what Parse could not read back", func(t *testing.T) {
		bad := []struct {
			name string
			c    Card
		}{
			{"empty front", Card{Front: "", Back: "a"}},
			{"empty back", Card{Front: "q", Back: ""}},
			{"whitespace front", Card{Front: "   ", Back: "a"}},
			{"newline in back", Card{Front: "q", Back: "a\nb"}},
			{"separator in front", Card{Front: "a :: b", Back: "c"}},
			{"backticks that swallow the separator", Card{Front: "a `b", Back: "c ` d"}},
			{"unsupported type", Card{Type: TypeCloze, Front: "q", Back: "a"}},
		}

		for _, tt := range bad {
			t.Run(tt.name, func(t *testing.T) {
				md := "prosa\n"
				updated, _, err := Insert(md, tt.c)
				if err == nil {
					t.Fatalf("Insert accepted %+v and produced %q", tt.c, updated)
				}
				if updated != md {
					t.Errorf("a rejected Insert changed the document: %q", updated)
				}
			})
		}
	})
}
