package export

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// The archive's shape, tested without a database.
//
// Loading is covered by the integration test in internal/api; what is worth
// testing here is the rendering, because that is where the acceptance
// criterion lives — "opening the notes folder in Obsidian works" is a claim
// about frontmatter and filenames, not about SQL.

func read(t *testing.T, a *Archive) map[string]string {
	t.Helper()

	var buf bytes.Buffer
	if err := a.Write(&buf); err != nil {
		t.Fatalf("writing the archive: %v", err)
	}

	r, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("reading the archive: %v", err)
	}

	out := map[string]string{}
	for _, f := range r.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("opening %s: %v", f.Name, err)
		}
		body, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatalf("reading %s: %v", f.Name, err)
		}
		out[f.Name] = string(body)
	}
	return out
}

func sampleArchive() *Archive {
	domainID := uuid.New()
	catID := uuid.New()
	noteID := uuid.New()
	deletedNoteID := uuid.New()
	cardID := uuid.New()
	now := time.Date(2026, 3, 14, 10, 0, 0, 0, time.UTC)
	deleted := now.Add(24 * time.Hour)

	return &Archive{
		User: gen.ExportUserRow{ID: uuid.New(), Email: "murid@example.com", CreatedAt: now},
		Domains: []gen.ExportDomainsRow{
			{ID: domainID, Slug: "math", Label: "Matematika"},
		},
		Categories: []gen.ExportCategoriesRow{
			{ID: catID, Slug: "aljabar", Label: "Aljabar"},
		},
		Notes: []gen.ExportNotesRow{
			{
				ID: noteID, Title: `Bab 3: "Ingatan"`, ContentMd: "Isi catatan.",
				DomainID: &domainID, CreatedAt: now, UpdatedAt: now,
			},
			{
				ID: deletedNoteID, Title: "Catatan lama", ContentMd: "Sudah dihapus.",
				CreatedAt: now, UpdatedAt: now, DeletedAt: &deleted,
			},
		},
		NoteCategories: []gen.ExportNoteCategoriesRow{{NoteID: noteID, CategoryID: catID}},
		Cards: []gen.ExportCardsRow{
			{
				ID: cardID, Type: "basic", Front: "Apa itu integral?", Back: "Kebalikan turunan.",
				DomainID: &domainID, CreatedAt: now, UpdatedAt: now,
			},
		},
		CardCategories: []gen.ExportCardCategoriesRow{{CardID: cardID, CategoryID: catID}},
		Schedules:      []gen.ExportCardSchedulesRow{{CardID: cardID, Stage: 2, State: "learning"}},
		ReviewLogs: []gen.ExportReviewLogsRow{
			{ID: 1, CardID: cardID, Rating: "ingat", ReviewedAt: now, Source: "review"},
		},
	}
}

// The acceptance criterion, in the part this package controls: a note arrives
// as markdown a vault can read, with its title, domain and categories intact
// rather than as an orphaned wall of text.
func TestNotesOpenAsAVault(t *testing.T) {
	files := read(t, sampleArchive())

	var noteName string
	for name := range files {
		if strings.HasPrefix(name, "notes/") && !strings.HasPrefix(name, "notes/terhapus/") {
			noteName = name
		}
	}
	if noteName == "" {
		t.Fatalf("no live note in the archive; got %v", keys(files))
	}
	if !strings.HasSuffix(noteName, ".md") {
		t.Errorf("note file %q is not markdown", noteName)
	}

	body := files[noteName]
	if !strings.HasPrefix(body, "---\n") {
		t.Fatalf("no frontmatter:\n%s", body)
	}
	for _, want := range []string{
		`title: "Bab 3: \"Ingatan\""`, // quoted and escaped, or the file will not parse
		`domain: "Matematika"`,
		`tags: ["Aljabar"]`,
		"# " + `Bab 3: "Ingatan"`,
		"Isi catatan.",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("note body is missing %q:\n%s", want, body)
		}
	}
}

// A deleted note is still a row the account owns, so it is in the archive —
// but not in the folder that gets opened as a vault, because a deleted note
// reappearing as a live one is its own kind of loss.
func TestDeletedItemsAreKeptButSeparated(t *testing.T) {
	files := read(t, sampleArchive())

	var live, deleted int
	for name := range files {
		switch {
		case strings.HasPrefix(name, "notes/terhapus/"):
			deleted++
		case strings.HasPrefix(name, "notes/"):
			live++
		}
	}
	if live != 1 {
		t.Errorf("%d live notes, want 1", live)
	}
	if deleted != 1 {
		t.Errorf("%d deleted notes, want 1 — a soft-deleted note is still the "+
			"user's and must not vanish from their own export", deleted)
	}
}

// Two notes with the same title must not become one file. Silent loss inside
// the archive that exists to prevent silent loss would be a bad bug.
func TestTitlesThatCollideGetSeparateFiles(t *testing.T) {
	now := time.Now()
	a := &Archive{
		User: gen.ExportUserRow{Email: "murid@example.com"},
		Notes: []gen.ExportNotesRow{
			{ID: uuid.New(), Title: "Rangkuman", ContentMd: "satu", CreatedAt: now, UpdatedAt: now},
			{ID: uuid.New(), Title: "Rangkuman", ContentMd: "dua", CreatedAt: now, UpdatedAt: now},
			{ID: uuid.New(), Title: "!!!", ContentMd: "tiga", CreatedAt: now, UpdatedAt: now},
			{ID: uuid.New(), Title: "", ContentMd: "empat", CreatedAt: now, UpdatedAt: now},
		},
	}

	files := read(t, a)

	var notes []string
	for name := range files {
		if strings.HasPrefix(name, "notes/") {
			notes = append(notes, name)
		}
	}
	if len(notes) != 4 {
		t.Fatalf("%d note files for 4 notes, want 4: %v", len(notes), notes)
	}

	bodies := map[string]bool{}
	for _, n := range notes {
		bodies[strings.TrimSpace(files[n])] = true
	}
	if len(bodies) != 4 {
		t.Error("two notes rendered to the same file; one overwrote the other")
	}
}

// The archive must never carry a credential. It is a file that gets emailed
// around and dropped in cloud storage.
func TestTheArchiveCarriesNoCredentials(t *testing.T) {
	files := read(t, sampleArchive())

	for name, body := range files {
		for _, banned := range []string{"password_hash", "token_hash", "argon2"} {
			if strings.Contains(body, banned) {
				t.Errorf("%s contains %q", name, banned)
			}
		}
	}
	// And the README says so, because a user cannot verify it by reading JSON.
	if !strings.Contains(files["README.md"], "Kata sandi dan sesi login") {
		t.Error("the README does not say credentials are excluded")
	}
}

// Everything that is not a note or a card still has to be in there — the
// schedules and the review history especially, since the review log is the one
// dataset that cannot be reconstructed after the fact (D-029).
func TestTheDataFolderCoversTheRest(t *testing.T) {
	files := read(t, sampleArchive())

	for _, want := range []string{
		"data/user.json", "data/settings.json", "data/domains.json",
		"data/categories.json", "data/notes.json", "data/note-categories.json",
		"data/cards.json", "data/card-categories.json", "data/schedules.json",
		"data/reviews.json", "data/focus-sessions.json", "data/exams.json",
		"data/exam-cards.json", "data/exam-attempts.json",
		"data/exam-attempt-cards.json",
	} {
		if _, ok := files[want]; !ok {
			t.Errorf("%s is missing from the archive", want)
		}
	}

	if !strings.Contains(files["data/reviews.json"], `"rating": "ingat"`) {
		t.Error("the review history did not survive into data/reviews.json")
	}
	if !strings.Contains(files["data/schedules.json"], `"stage": 2`) {
		t.Error("the schedule did not survive into data/schedules.json")
	}
}

// A note that already opens with its own heading must not get a second one.
// Two H1s in a row is the kind of small wrongness that makes an export feel
// machine-made.
func TestANoteWithItsOwnHeadingDoesNotGetASecond(t *testing.T) {
	now := time.Now()
	a := &Archive{
		User: gen.ExportUserRow{Email: "murid@example.com"},
		Notes: []gen.ExportNotesRow{
			{ID: uuid.New(), Title: "Punya judul", ContentMd: "# Isi\n\nBaris.", CreatedAt: now, UpdatedAt: now},
			{ID: uuid.New(), Title: "Tanpa judul di isi", ContentMd: "Langsung prosa.", CreatedAt: now, UpdatedAt: now},
		},
	}

	files := read(t, a)
	for name, body := range files {
		if !strings.HasPrefix(name, "notes/") {
			continue
		}
		_, after, _ := strings.Cut(body, "---\n\n") // drop the frontmatter
		if strings.Count(after, "\n# ")+strings.Count(after, "# ")-strings.Count(after, "\n# ") > 1 {
			t.Errorf("%s has more than one H1:\n%s", name, body)
		}
		if strings.Contains(body, "# Punya judul\n\n# Isi") {
			t.Errorf("%s repeated the title above the body's own heading", name)
		}
		if strings.Contains(body, "Langsung prosa") && !strings.Contains(body, "# Tanpa judul di isi") {
			t.Errorf("%s lost its title heading", name)
		}
	}
}

func TestCardsCarryBothSides(t *testing.T) {
	files := read(t, sampleArchive())

	var card string
	for name, body := range files {
		if strings.HasPrefix(name, "cards/") {
			card = body
		}
	}
	if card == "" {
		t.Fatal("no card in the archive")
	}
	for _, want := range []string{"## Depan", "Apa itu integral?", "## Belakang", "Kebalikan turunan."} {
		if !strings.Contains(card, want) {
			t.Errorf("card is missing %q:\n%s", want, card)
		}
	}
}

func TestSlug(t *testing.T) {
	cases := map[string]string{
		"Bab 3: Ingatan":  "bab-3-ingatan",
		"  spasi  ganda ": "spasi-ganda",
		"!!!":             "",
		"":                "",
		"Sudut θ dan π":   "sudut-θ-dan-π", // non-ASCII letters survive
		"a/b\\c":          "a-b-c",
	}
	for in, want := range cases {
		if got := slug(in); got != want {
			t.Errorf("slug(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFilenameIsDated(t *testing.T) {
	// Two exports should produce two files rather than one overwritten.
	got := Filename(time.Date(2026, 8, 11, 0, 0, 0, 0, time.UTC))
	if got != "konku-export-2026-08-11.zip" {
		t.Errorf("Filename = %q", got)
	}
}

func keys(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
