package export

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Notes and cards leave as markdown with YAML frontmatter.
//
// The frontmatter is not decoration: it is what makes the acceptance criterion
// — "opening the notes folder in Obsidian works" — mean something more than
// "the files have a .md extension". Obsidian reads `tags` and shows the rest
// as properties, so a note arrives with its domain and its categories intact
// rather than as an orphaned wall of text.

// noteMarkdown renders one note.
func noteMarkdown(n gen.ExportNotesRow, domains map[uuid.UUID]string, cats []string) string {
	var b strings.Builder

	fm := frontmatter{}
	fm.add("title", n.Title)
	if n.DomainID != nil {
		fm.add("domain", domains[*n.DomainID])
	}
	fm.addList("tags", cats)
	fm.add("created", n.CreatedAt.Format("2006-01-02"))
	fm.add("updated", n.UpdatedAt.Format("2006-01-02"))
	if n.DeletedAt != nil {
		fm.add("terhapus", n.DeletedAt.Format("2006-01-02"))
	}
	b.WriteString(fm.String())

	// The title becomes an H1, because it lives in its own column and a
	// markdown file whose first line is prose reads as a fragment anywhere
	// outside this app.
	//
	// Unless the body already opens with one. Notes written with their own
	// heading are common, and two H1s in a row is the kind of small wrongness
	// that makes an export feel machine-made.
	if !strings.HasPrefix(strings.TrimLeft(n.ContentMd, " \t\n"), "# ") {
		b.WriteString("# " + n.Title + "\n\n")
	}
	b.WriteString(strings.TrimRight(n.ContentMd, "\n"))
	b.WriteString("\n")
	return b.String()
}

// cardMarkdown renders one card.
//
// Cards became their own resource in D-055, so they get their own files rather
// than being folded back into the notes they were once parsed out of. Front and
// back are headed sections: a flashcard with an unlabelled second half is a
// puzzle rather than a record.
func cardMarkdown(c gen.ExportCardsRow, domains map[uuid.UUID]string, cats []string) string {
	var b strings.Builder

	fm := frontmatter{}
	fm.add("type", c.Type)
	if c.DomainID != nil {
		fm.add("domain", domains[*c.DomainID])
	}
	fm.addList("tags", cats)
	fm.add("created", c.CreatedAt.Format("2006-01-02"))
	if c.DeletedAt != nil {
		fm.add("terhapus", c.DeletedAt.Format("2006-01-02"))
	}
	b.WriteString(fm.String())

	b.WriteString("## Depan\n\n")
	b.WriteString(strings.TrimRight(c.Front, "\n"))
	b.WriteString("\n\n## Belakang\n\n")
	b.WriteString(strings.TrimRight(c.Back, "\n"))
	b.WriteString("\n")
	return b.String()
}

// frontmatter builds a small YAML block.
//
// Hand-written rather than through a YAML library, which would be a
// dependency for one block of at most six keys (D-065). Values are quoted and
// escaped, which is the only part that actually matters: a note titled
// `Bab 3: "Ingatan"` must not produce a file Obsidian refuses to parse.
type frontmatter struct {
	lines []string
}

func (f *frontmatter) add(key, value string) {
	if value == "" {
		return
	}
	f.lines = append(f.lines, key+": "+quoteYAML(value))
}

func (f *frontmatter) addList(key string, values []string) {
	if len(values) == 0 {
		return
	}
	quoted := make([]string, 0, len(values))
	for _, v := range values {
		quoted = append(quoted, quoteYAML(v))
	}
	f.lines = append(f.lines, key+": ["+strings.Join(quoted, ", ")+"]")
}

func (f *frontmatter) String() string {
	if len(f.lines) == 0 {
		return ""
	}
	return "---\n" + strings.Join(f.lines, "\n") + "\n---\n\n"
}

// quoteYAML produces a double-quoted YAML scalar.
//
// Always quoted, never bare. A bare scalar has to dodge a list of characters
// that are special only in some positions, and the failure mode of getting it
// wrong is a file that silently will not parse.
func quoteYAML(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n', '\r':
			// A newline inside a title would end the frontmatter line and turn
			// the rest of the file into garbage.
			b.WriteByte(' ')
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// namer turns titles into filenames that are unique within their folder.
//
// Two notes may legitimately share a title, and a title may be empty or
// entirely punctuation. Neither is a reason for one file to overwrite another:
// silent loss inside the archive that exists to prevent silent loss would be a
// particularly bad bug.
type namer struct {
	used map[string]bool
}

func newNamer() *namer { return &namer{used: map[string]bool{}} }

func (n *namer) pick(dir, title string, id uuid.UUID) string {
	base := slug(title)
	if base == "" {
		// Nothing usable in the title, so fall back to the id rather than
		// producing "untitled" for every one of them.
		base = "tanpa-judul-" + id.String()[:8]
	}

	name := base + ".md"
	for i := 2; n.used[dir+name]; i++ {
		name = fmt.Sprintf("%s-%d.md", base, i)
	}
	n.used[dir+name] = true
	return name
}

// slug makes a filename-safe, lowercase name.
//
// Letters and digits survive, including non-ASCII ones — a note titled in
// Indonesian or with a Japanese term in it should not come out as a row of
// dashes. Everything else becomes a separator.
func slug(s string) string {
	var b strings.Builder
	lastDash := true // leading dashes are suppressed

	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
			lastDash = false
		case !lastDash:
			b.WriteByte('-')
			lastDash = true
		}
		if b.Len() >= maxSlug {
			break
		}
	}

	return strings.Trim(b.String(), "-")
}

// maxSlug keeps filenames comfortably inside the limits of every filesystem
// the archive might be unzipped onto. Titles are usually far shorter; a note
// whose title is a paragraph still produces a usable name.
const maxSlug = 60
