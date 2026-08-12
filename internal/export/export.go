// Package export builds the archive of everything an account owns (07 L6).
//
// This is what makes "no lock-in" true rather than a claim, and it is a legal
// expectation once other people's data is here (D-066). It is also the half of
// account deletion that makes deletion safe to offer: L7 offers the export
// first, and an export that quietly omitted something would make that offer a
// lie.
//
// The shape:
//
//	README.md                  what this archive is, in Indonesian
//	notes/<slug>.md            one file per live note, YAML frontmatter
//	notes/terhapus/<slug>.md   soft-deleted notes, kept out of the main folder
//	cards/<slug>.md            one file per live card
//	cards/terhapus/<slug>.md   soft-deleted cards
//	data/*.json                everything else, one file per table
//
// Notes and cards are markdown because that is what they are — opening the
// notes folder in Obsidian has to work, which is the acceptance criterion for
// this task and the reason for the frontmatter. Everything else is JSON
// because inventing a human-readable format for a review log would be
// inventing a format nobody can read back.
package export

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Archive is every row an account owns, read before anything is written.
//
// Loaded whole rather than streamed straight into the zip on purpose. A
// streaming export has already sent 200 and half a file by the time a query
// fails, so the user receives a truncated archive that looks complete — the
// exact failure this feature exists to prevent. Reading first means a failure
// is an error response, and the bytes only start once the data is in hand.
// One account's rows fit in memory at any scale this product will reach.
type Archive struct {
	User     gen.ExportUserRow
	Settings *gen.UserSetting

	Domains    []gen.ExportDomainsRow
	Categories []gen.ExportCategoriesRow

	Notes          []gen.ExportNotesRow
	NoteCategories []gen.ExportNoteCategoriesRow
	Cards          []gen.ExportCardsRow
	CardCategories []gen.ExportCardCategoriesRow

	Schedules     []gen.ExportCardSchedulesRow
	ReviewLogs    []gen.ExportReviewLogsRow
	FocusSessions []gen.ExportFocusSessionsRow

	ReviewSets          []gen.ExportReviewSetsRow
	ReviewSetDomains    []gen.ExportReviewSetDomainsRow
	ReviewSetCategories []gen.ExportReviewSetCategoriesRow
	ReviewSetCards      []gen.ExportReviewSetCardsRow
	ReviewRuns          []gen.ExportReviewRunsRow
	ReviewRunCards      []gen.ExportReviewRunCardsRow
}

// Load reads everything the account owns.
//
// Inside one user-scoped transaction: the queries carry their own user_id
// predicate (hard rule 4), and the transaction is what makes RLS apply and
// what makes the archive a consistent snapshot rather than a set of reads
// taken at different moments while the user is still typing.
func Load(ctx context.Context, st *store.Store, userID uuid.UUID) (*Archive, error) {
	a := &Archive{}

	err := st.WithUserTx(ctx, userID, func(q *gen.Queries) error {
		var err error
		if a.User, err = q.ExportUser(ctx, userID); err != nil {
			return fmt.Errorf("export: user: %w", err)
		}

		// Settings are a single row that every account should have, but an
		// account predating migration 00007's backfill would not. A missing
		// row is not a reason to refuse someone their notes.
		if settings, err := q.ExportUserSettings(ctx, userID); err == nil {
			a.Settings = &settings
		}

		for _, step := range []struct {
			name string
			read func() error
		}{
			{"domains", func() (err error) { a.Domains, err = q.ExportDomains(ctx, userID); return }},
			{"categories", func() (err error) { a.Categories, err = q.ExportCategories(ctx, userID); return }},
			{"notes", func() (err error) { a.Notes, err = q.ExportNotes(ctx, userID); return }},
			{"note categories", func() (err error) { a.NoteCategories, err = q.ExportNoteCategories(ctx, userID); return }},
			{"cards", func() (err error) { a.Cards, err = q.ExportCards(ctx, userID); return }},
			{"card categories", func() (err error) { a.CardCategories, err = q.ExportCardCategories(ctx, userID); return }},
			{"schedules", func() (err error) { a.Schedules, err = q.ExportCardSchedules(ctx, userID); return }},
			{"review logs", func() (err error) { a.ReviewLogs, err = q.ExportReviewLogs(ctx, userID); return }},
			{"focus sessions", func() (err error) { a.FocusSessions, err = q.ExportFocusSessions(ctx, userID); return }},
			{"review sets", func() (err error) { a.ReviewSets, err = q.ExportReviewSets(ctx, userID); return }},
			{"review set domains", func() (err error) { a.ReviewSetDomains, err = q.ExportReviewSetDomains(ctx, userID); return }},
			{"review set categories", func() (err error) { a.ReviewSetCategories, err = q.ExportReviewSetCategories(ctx, userID); return }},
			{"review set cards", func() (err error) { a.ReviewSetCards, err = q.ExportReviewSetCards(ctx, userID); return }},
			{"review runs", func() (err error) { a.ReviewRuns, err = q.ExportReviewRuns(ctx, userID); return }},
			{"review run cards", func() (err error) { a.ReviewRunCards, err = q.ExportReviewRunCards(ctx, userID); return }},
		} {
			if err := step.read(); err != nil {
				return fmt.Errorf("export: %s: %w", step.name, err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return a, nil
}

// Filename is the name the archive is offered under. Dated, because someone
// who exports twice should end up with two files rather than one overwritten.
func Filename(now time.Time) string {
	return fmt.Sprintf("konku-export-%s.zip", now.Format("2006-01-02"))
}

// Write renders the archive as a zip.
func (a *Archive) Write(w io.Writer) error {
	z := zip.NewWriter(w)

	names := newNamer()

	// Lookup tables the markdown needs: a note carries a domain uuid and a set
	// of category uuids, and neither means anything to a human reading a file.
	domains := map[uuid.UUID]string{}
	for _, d := range a.Domains {
		domains[d.ID] = d.Label
	}
	categories := map[uuid.UUID]string{}
	for _, c := range a.Categories {
		categories[c.ID] = c.Label
	}
	noteCats := map[uuid.UUID][]string{}
	for _, nc := range a.NoteCategories {
		if label, ok := categories[nc.CategoryID]; ok {
			noteCats[nc.NoteID] = append(noteCats[nc.NoteID], label)
		}
	}
	cardCats := map[uuid.UUID][]string{}
	for _, cc := range a.CardCategories {
		if label, ok := categories[cc.CategoryID]; ok {
			cardCats[cc.CardID] = append(cardCats[cc.CardID], label)
		}
	}

	if err := writeFile(z, "README.md", []byte(readme(a))); err != nil {
		return err
	}

	for _, n := range a.Notes {
		dir := "notes/"
		if n.DeletedAt != nil {
			// Kept, but not in the folder someone opens in Obsidian. A deleted
			// note reappearing as a live one would be its own kind of data
			// loss, and the archive should not decide it was a mistake.
			dir = "notes/terhapus/"
		}
		body := noteMarkdown(n, domains, noteCats[n.ID])
		if err := writeFile(z, dir+names.pick(dir, n.Title, n.ID), []byte(body)); err != nil {
			return err
		}
	}

	for _, c := range a.Cards {
		dir := "cards/"
		if c.DeletedAt != nil {
			dir = "cards/terhapus/"
		}
		body := cardMarkdown(c, domains, cardCats[c.ID])
		if err := writeFile(z, dir+names.pick(dir, c.Front, c.ID), []byte(body)); err != nil {
			return err
		}
	}

	for _, f := range []struct {
		name string
		v    any
	}{
		{"data/user.json", a.User},
		{"data/settings.json", a.Settings},
		{"data/domains.json", a.Domains},
		{"data/categories.json", a.Categories},
		{"data/notes.json", a.Notes},
		{"data/note-categories.json", a.NoteCategories},
		{"data/cards.json", a.Cards},
		{"data/card-categories.json", a.CardCategories},
		{"data/schedules.json", a.Schedules},
		{"data/reviews.json", a.ReviewLogs},
		{"data/focus-sessions.json", a.FocusSessions},
		{"data/review-sets.json", a.ReviewSets},
		{"data/review-set-domains.json", a.ReviewSetDomains},
		{"data/review-set-categories.json", a.ReviewSetCategories},
		{"data/review-set-cards.json", a.ReviewSetCards},
		{"data/review-runs.json", a.ReviewRuns},
		{"data/review-run-cards.json", a.ReviewRunCards},
	} {
		buf, err := json.MarshalIndent(f.v, "", "  ")
		if err != nil {
			return fmt.Errorf("export: encoding %s: %w", f.name, err)
		}
		if err := writeFile(z, f.name, append(buf, '\n')); err != nil {
			return err
		}
	}

	if err := z.Close(); err != nil {
		return fmt.Errorf("export: closing the archive: %w", err)
	}
	return nil
}

func writeFile(z *zip.Writer, name string, body []byte) error {
	f, err := z.Create(name)
	if err != nil {
		return fmt.Errorf("export: creating %s: %w", name, err)
	}
	if _, err := f.Write(body); err != nil {
		return fmt.Errorf("export: writing %s: %w", name, err)
	}
	return nil
}
