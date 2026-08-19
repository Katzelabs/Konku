package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/srs"
	"github.com/Katzelabs/Konku/internal/store"
)

// seedDemo fills one account with a plausible knowledge base.
//
// It exists for screenshots and for demos: every screen in this application
// looks the same on an empty account — an empty state — and none of them can
// be judged, shown or designed against nothing. What it produces is the shape
// of a few months of ordinary use, not a stress test: notes with real prose,
// cards at every stage of the ladder, review history that predates today,
// focus sessions on most days, saved sets with sittings behind them, and a few
// rows in Terhapus.
//
//	konku seed-demo -email demo@konku.app
//
// Two guards, because this writes into an account rather than a scratch
// database:
//
//  1. It refuses to run against a non-dev config without -force. The dev
//     database holds real notes now (D-067) and production holds other
//     people's; neither wants demo content appended to it by a mistyped
//     DATABASE_URL.
//  2. It refuses to touch an account that already has content unless -reset is
//     passed, and -reset deletes that account's content and nothing else.
//
// Everything runs in one transaction, with app.user_id set, so RLS applies to
// the seeder exactly as it does to the application (D-059) — a bug here that
// wrote somebody else's user_id would fail rather than land.
func seedDemo(args []string) error {
	fs := flag.NewFlagSet("seed-demo", flag.ExitOnError)
	email := fs.String("email", "demo@konku.app", "account to fill")
	name := fs.String("name", "Rani Prasetya", "display name for the account")
	reset := fs.Bool("reset", false, "delete this account's existing content first")
	force := fs.Bool("force", false, "allow running against a non-dev config")
	passwordStdin := fs.Bool("password-stdin", false,
		"read the password from stdin when the account has to be created")
	// Fixed by default so two runs produce the same database. A screenshot
	// retaken next week should show the same numbers as the one beside it.
	seed := fs.Int64("seed", 20260819, "random seed for the generated history")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*email) == "" {
		return errors.New("seed-demo: -email is required")
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if !cfg.Dev && !*force {
		return errors.New("seed-demo: refusing to seed a non-dev config; " +
			"set DEV=true for a local database, or pass -force if this is " +
			"genuinely what you want")
	}

	ctx := context.Background()
	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	if err := st.Migrate(ctx, cfg.MigrationDatabaseURL); err != nil {
		return err
	}

	user, err := st.Q().GetUserByEmail(ctx, strings.ToLower(strings.TrimSpace(*email)))
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		password, perr := readPassword(*passwordStdin)
		if perr != nil {
			return perr
		}
		svc := auth.NewService(st, cfg.SessionTTL)
		user, err = svc.CreateUser(ctx, *email, password)
		if err != nil {
			return err
		}
		fmt.Printf("Created account %s\n", user.Email)
	case err != nil:
		return fmt.Errorf("seed-demo: looking up %s: %w", *email, err)
	default:
		fmt.Printf("Filling existing account %s\n", user.Email)
	}

	s := &demoSeeder{
		ctx:    ctx,
		user:   user.ID,
		rng:    rand.New(rand.NewSource(*seed)),
		today:  startOfDay(time.Now()),
		counts: map[string]int{},
	}

	tx, err := st.Pool().Begin(ctx)
	if err != nil {
		return fmt.Errorf("seed-demo: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	s.tx = tx

	// The same mechanism WithUserTx uses. Every INSERT below carries user_id,
	// and the policies check it again.
	if _, err := tx.Exec(ctx,
		"select set_config('app.user_id', $1, true)", s.user.String(),
	); err != nil {
		return fmt.Errorf("seed-demo: setting app.user_id: %w", err)
	}

	existing, err := s.contentCount()
	if err != nil {
		return err
	}
	if existing > 0 && !*reset {
		return fmt.Errorf("seed-demo: %s already has %d notes, cards, sets or "+
			"sessions. Re-run with -reset to replace them, or pick another "+
			"-email", user.Email, existing)
	}
	if *reset {
		removed, err := s.wipe()
		if err != nil {
			return err
		}
		fmt.Printf("Removed %d existing rows from this account\n", removed)
	}

	if err := s.setName(*name); err != nil {
		return err
	}
	if err := s.seedAll(); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("seed-demo: commit: %w", err)
	}

	fmt.Println()
	fmt.Printf("Seeded %s:\n", user.Email)
	for _, k := range []string{
		"domains", "categories", "notes", "cards", "schedules",
		"review logs", "focus sessions", "review sets", "review runs",
	} {
		fmt.Printf("  %-15s %d\n", k, s.counts[k])
	}
	fmt.Println()
	fmt.Println("Sign in at http://localhost:5173 and start on Beranda.")
	return nil
}

// demoSeeder carries the transaction and the deterministic randomness through
// the insert helpers, so none of them has to take six arguments.
type demoSeeder struct {
	ctx   context.Context
	tx    pgx.Tx
	user  uuid.UUID
	rng   *rand.Rand
	today time.Time

	domains    map[string]uuid.UUID
	categories map[string]uuid.UUID
	cards      []seededCard
	counts     map[string]int
}

// seededCard is a card after it has an id, kept so the sets and the review
// history can point at real rows rather than re-query for them.
type seededCard struct {
	ID         uuid.UUID
	Front      string
	Back       string
	Domain     string
	Categories []string
	Deleted    bool
}

func (s *demoSeeder) exec(sql string, args ...any) error {
	if _, err := s.tx.Exec(s.ctx, sql, args...); err != nil {
		return fmt.Errorf("seed-demo: %w", err)
	}
	return nil
}

func (s *demoSeeder) count(kind string, n int) { s.counts[kind] += n }

// contentCount answers "is there anything here already". Domains are excluded
// deliberately: every account has the starter set from the moment it is
// created (store.SeedDefaultDomains), so counting them would make every
// account look occupied.
func (s *demoSeeder) contentCount() (int, error) {
	var n int
	err := s.tx.QueryRow(s.ctx, `
		SELECT (SELECT count(*) FROM notes          WHERE user_id = $1)
		     + (SELECT count(*) FROM cards          WHERE user_id = $1)
		     + (SELECT count(*) FROM review_sets    WHERE user_id = $1)
		     + (SELECT count(*) FROM focus_sessions WHERE user_id = $1)
		     + (SELECT count(*) FROM review_logs    WHERE user_id = $1)`,
		s.user).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("seed-demo: counting existing content: %w", err)
	}
	return n, nil
}

// wipe removes this account's content, in foreign-key order.
//
// Domains survive: they are the starter set every account gets, the seeder
// updates them in place, and deleting them would take the account's own
// history of what it studies with it. Nothing here can reach another account's
// rows — every statement is scoped by user_id and RLS is on.
func (s *demoSeeder) wipe() (int, error) {
	tables := []string{
		"review_logs",
		"review_run_cards",
		"review_runs",
		"review_set_cards",
		"review_set_categories",
		"review_set_domains",
		"review_sets",
		"card_schedules",
		"card_categories",
		"note_categories",
		"cards",
		"notes",
		"focus_sessions",
		"categories",
	}
	total := 0
	for _, t := range tables {
		tag, err := s.tx.Exec(s.ctx, "DELETE FROM "+t+" WHERE user_id = $1", s.user)
		if err != nil {
			return 0, fmt.Errorf("seed-demo: clearing %s: %w", t, err)
		}
		total += int(tag.RowsAffected())
	}
	return total, nil
}

// setName gives the account a display name. seed-user leaves both empty and
// the UI falls back to the email address, which reads as a placeholder in a
// screenshot.
func (s *demoSeeder) setName(full string) error {
	first, last, _ := strings.Cut(strings.TrimSpace(full), " ")
	return s.exec(
		"UPDATE users SET first_name = $2, last_name = $3 WHERE id = $1",
		s.user, first, strings.TrimSpace(last))
}

func (s *demoSeeder) seedAll() error {
	if err := s.seedDomains(); err != nil {
		return err
	}
	if err := s.seedCategories(); err != nil {
		return err
	}
	if err := s.seedNotes(); err != nil {
		return err
	}
	if err := s.seedCards(); err != nil {
		return err
	}
	if err := s.seedReviewHistory(); err != nil {
		return err
	}
	if err := s.seedFocusSessions(); err != nil {
		return err
	}
	return s.seedSets()
}

func (s *demoSeeder) seedDomains() error {
	s.domains = make(map[string]uuid.UUID, len(demoDomains))
	for i, d := range demoDomains {
		var id uuid.UUID
		// The starter domains already exist on a freshly created account, so
		// this updates rather than duplicates. archived_at is cleared: a demo
		// account should not open on a domain list with a hidden row in it.
		err := s.tx.QueryRow(s.ctx, `
			INSERT INTO domains (user_id, slug, label, color, weekly_quota, sort_order, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (user_id, slug) DO UPDATE
			SET label = EXCLUDED.label,
			    color = EXCLUDED.color,
			    weekly_quota = EXCLUDED.weekly_quota,
			    sort_order = EXCLUDED.sort_order,
			    archived_at = NULL
			RETURNING id`,
			s.user, d.Slug, d.Label, d.Color, d.Quota, int32(i+1),
			s.daysAgo(90, 9)).Scan(&id)
		if err != nil {
			return fmt.Errorf("seed-demo: domain %q: %w", d.Slug, err)
		}
		s.domains[d.Slug] = id
	}
	s.count("domains", len(demoDomains))
	return nil
}

func (s *demoSeeder) seedCategories() error {
	s.categories = make(map[string]uuid.UUID, len(demoCategories))
	for i, c := range demoCategories {
		var id uuid.UUID
		err := s.tx.QueryRow(s.ctx, `
			INSERT INTO categories (user_id, slug, label, color, created_at)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (user_id, slug) DO UPDATE
			SET label = EXCLUDED.label, color = EXCLUDED.color, archived_at = NULL
			RETURNING id`,
			s.user, c.Slug, c.Label, c.Color, s.daysAgo(88-i, 10)).Scan(&id)
		if err != nil {
			return fmt.Errorf("seed-demo: category %q: %w", c.Slug, err)
		}
		s.categories[c.Slug] = id
	}
	s.count("categories", len(demoCategories))
	return nil
}

func (s *demoSeeder) seedNotes() error {
	for _, n := range demoNotes {
		id := uuid.New()
		created := s.daysAgo(n.CreatedAgo, 9)
		updated := s.daysAgo(n.UpdatedAgo, 20)
		if updated.Before(created) {
			updated = created
		}
		var deletedAt *time.Time
		if n.Deleted {
			// Inside the 30-day window, so the account has a Terhapus view
			// with something in it and the purge job (D-069) will not empty it
			// during a demo.
			d := s.daysAgo(n.UpdatedAgo, 21)
			deletedAt = &d
		}

		if err := s.exec(`
			INSERT INTO notes (id, user_id, title, content_md, domain_id,
			                   created_at, updated_at, deleted_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			id, s.user, n.Title, n.Body, s.domainID(n.Domain),
			created, updated, deletedAt); err != nil {
			return err
		}
		for _, slug := range n.Categories {
			if err := s.exec(`
				INSERT INTO note_categories (user_id, note_id, category_id)
				VALUES ($1, $2, $3)`,
				s.user, id, s.categories[slug]); err != nil {
				return err
			}
		}
		s.count("notes", 1)
	}
	return nil
}

func (s *demoSeeder) seedCards() error {
	for _, c := range demoCards {
		id := uuid.New()
		created := s.daysAgo(c.CreatedAgo, 11)
		var deletedAt *time.Time
		if c.Deleted {
			d := s.daysAgo(minInt(c.CreatedAgo, 12), 16)
			deletedAt = &d
		}

		if err := s.exec(`
			INSERT INTO cards (id, user_id, domain_id, type, front, back,
			                   created_at, updated_at, deleted_at)
			VALUES ($1, $2, $3, 'basic', $4, $5, $6, $7, $8)`,
			id, s.user, s.domainID(c.Domain), c.Front, c.Back,
			created, created, deletedAt); err != nil {
			return err
		}
		for _, slug := range c.Categories {
			if err := s.exec(`
				INSERT INTO card_categories (user_id, card_id, category_id)
				VALUES ($1, $2, $3)`,
				s.user, id, s.categories[slug]); err != nil {
				return err
			}
		}

		// Every card has a schedule row, deleted ones included: a card that
		// comes back from Terhapus comes back with its history (D-019).
		state := "learning"
		stage := c.Stage
		var due any
		if c.Mastered {
			state = "mastered"
			stage = len(srs.Intervals) - 1
			due = nil
		} else {
			due = s.today.AddDate(0, 0, c.Due).Format("2006-01-02")
		}
		if err := s.exec(`
			INSERT INTO card_schedules (card_id, user_id, stage, next_review_date, lapses, state)
			VALUES ($1, $2, $3, $4::date, $5, $6)`,
			id, s.user, stage, due, c.Lapses, state); err != nil {
			return err
		}

		s.cards = append(s.cards, seededCard{
			ID: id, Front: c.Front, Back: c.Back, Domain: c.Domain,
			Categories: c.Categories, Deleted: c.Deleted,
		})
		s.count("cards", 1)
		s.count("schedules", 1)
	}
	return nil
}

// seedReviewHistory writes the reviews that produced the schedules above.
//
// It cannot be derived from them and it cannot be reconstructed later, which
// is the whole reason review_logs exists before anything reads it (D-029) —
// and an account whose cards sit at stage 5 with no history behind them is the
// one thing here that would read as fake.
func (s *demoSeeder) seedReviewHistory() error {
	live := s.liveCards()
	if len(live) == 0 {
		return nil
	}

	for day := historyDays; day >= 0; day-- {
		// Roughly two days in three. A history with no gaps in it is not a
		// history of a person, and the product's whole position is that a
		// missed day is normal (hard rule 6).
		if s.rng.Float64() < 0.32 {
			continue
		}
		n := 3 + s.rng.Intn(9)
		if day == 0 {
			n = 2 + s.rng.Intn(3)
		}

		for _, c := range s.sample(live, n) {
			rating := "ingat"
			if s.rng.Float64() < 0.17 {
				rating = "lupa"
			}
			stage := s.rng.Intn(len(srs.Intervals) - 1)
			before := srs.Intervals[stage]
			after := srs.Intervals[stage+1]
			if rating == "lupa" {
				after = srs.Intervals[0]
			}
			at := s.dayAt(day, 7+s.rng.Intn(15), s.rng.Intn(60))

			if err := s.exec(`
				INSERT INTO review_logs (card_id, user_id, rating,
				                         interval_before, interval_after,
				                         reviewed_at, source, format)
				VALUES ($1, $2, $3, $4, $5, $6, 'due', 'recall')`,
				c.ID, s.user, rating, before, after, at); err != nil {
				return err
			}
			s.count("review logs", 1)
		}
	}
	return nil
}

func (s *demoSeeder) seedFocusSessions() error {
	// Weighted towards the domains with a weekly quota, because that is what a
	// rota actually produces.
	pool := []string{
		"math", "math", "math",
		"psychology", "psychology",
		"english", "english",
		"general", "general",
		"music",
		"coding",
	}
	durations := []int32{15, 20, 25, 25, 30, 45, 50}

	for day := sessionDays; day >= 0; day-- {
		// Today always has one, so the timer screen and the session list open
		// on something rather than on an empty state.
		if day > 0 && s.rng.Float64() < 0.38 {
			continue
		}
		count := 1
		if s.rng.Float64() < 0.35 {
			count = 2
		}
		for i := 0; i < count; i++ {
			domain := pool[s.rng.Intn(len(pool))]
			duration := durations[s.rng.Intn(len(durations))]
			hour := 8 + s.rng.Intn(13)
			at := s.dayAt(day, hour, s.rng.Intn(60))

			if err := s.exec(`
				INSERT INTO focus_sessions (user_id, domain_id, duration_minutes,
				                            session_date, completed_at)
				VALUES ($1, $2, $3, $4::date, $5)`,
				s.user, s.domainID(domain), duration,
				at.Format("2006-01-02"), at); err != nil {
				return err
			}
			s.count("focus sessions", 1)
		}
	}
	return nil
}

func (s *demoSeeder) seedSets() error {
	for _, set := range demoSets {
		setID := uuid.New()
		eligible := s.eligible(set.Domains, set.Categories)
		if len(eligible) < 2 {
			return fmt.Errorf("seed-demo: set %q matches %d cards; it needs at least 2",
				set.Title, len(eligible))
		}

		var questionCount any
		if set.Selection == "random" {
			// Clamped rather than trusted: the check constraint would reject a
			// run whose counts disagree with its snapshot, and a set that asks
			// for more questions than exist is a set that cannot be started.
			n := int32(minInt(int(set.Count), len(eligible)))
			questionCount = n
		}
		var timeLimit any
		if set.TimeLimit > 0 {
			timeLimit = set.TimeLimit
		}

		created := s.daysAgo(set.CreatedAgo, 14)
		if err := s.exec(`
			INSERT INTO review_sets (id, user_id, title, description, selection,
			                         format, question_count, time_limit_minutes,
			                         created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
			setID, s.user, set.Title, set.Description, set.Selection,
			set.Format, questionCount, timeLimit, created); err != nil {
			return err
		}
		for _, slug := range set.Domains {
			if err := s.exec(`
				INSERT INTO review_set_domains (user_id, set_id, domain_id)
				VALUES ($1, $2, $3)`, s.user, setID, s.domainID(slug)); err != nil {
				return err
			}
		}
		for _, slug := range set.Categories {
			if err := s.exec(`
				INSERT INTO review_set_categories (user_id, set_id, category_id)
				VALUES ($1, $2, $3)`, s.user, setID, s.categories[slug]); err != nil {
				return err
			}
		}

		// A fixed set pins its questions; a random one draws them per sitting.
		fixed := eligible
		if set.Selection == "fixed" {
			fixed = eligible[:minInt(set.CardCount, len(eligible))]
			for i, c := range fixed {
				if err := s.exec(`
					INSERT INTO review_set_cards (set_id, user_id, card_id, position)
					VALUES ($1, $2, $3, $4)`,
					setID, s.user, c.ID, int32(i+1)); err != nil {
					return err
				}
			}
		}

		for _, run := range set.Runs {
			if err := s.seedRun(set, setID, fixed, eligible, run); err != nil {
				return err
			}
		}
		s.count("review sets", 1)
	}
	return nil
}

// seedRun writes one sitting: the run, its snapshot, and the answers.
//
// The snapshot is what makes a run resumable and what keeps a finished one
// readable after its cards change (D-050), so it is written here rather than
// implied — a run row with no review_run_cards renders as a sitting of nothing.
func (s *demoSeeder) seedRun(
	set demoSet, setID uuid.UUID,
	fixed, eligible []seededCard,
	run demoRun,
) error {
	questions := fixed
	if set.Selection == "random" {
		questions = s.sample(eligible, minInt(run.Total, len(eligible)))
	}
	if len(questions) == 0 {
		return fmt.Errorf("seed-demo: run for %q drew no questions", set.Title)
	}

	runID := uuid.New()
	started := s.dayAt(run.DaysAgo, 19+s.rng.Intn(2), s.rng.Intn(60))

	correct := minInt(run.Correct, len(questions))
	answered := len(questions)
	var finished any
	if run.Open {
		finished = nil
		answered = minInt(run.Answered, len(questions))
		correct = answered - answered/3
	} else {
		// FinishRun computes these from the snapshot and the answers, so the
		// seeded values have to agree with what it would have written.
		finished = started.Add(time.Duration(len(questions)) * 47 * time.Second)
	}

	totalCount, correctCount := len(questions), correct
	if run.Open {
		// An unfinished run has not been scored yet; the columns stay at zero
		// until the user presses "lihat hasil".
		totalCount, correctCount = 0, 0
	}

	if err := s.exec(`
		INSERT INTO review_runs (id, set_id, user_id, started_at, finished_at,
		                         run_date, total_count, correct_count)
		VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)`,
		runID, setID, s.user, started, finished,
		started.Format("2006-01-02"), int32(totalCount), int32(correctCount)); err != nil {
		return err
	}

	// Distractors come from the set's own pool first, widening to the whole
	// collection only when that pool cannot fill four options — the same order
	// ListDistractorPool uses, and the reason a music question does not get a
	// statistics answer among its choices.
	backs := backsOf(eligible)
	if len(backs) < 4 {
		backs = append(backs, s.backs()...)
	}
	for i, q := range questions {
		var options any
		var correctIndex any
		if set.Format == "choice" {
			opts, idx := s.choices(q.Back, backs)
			// Fewer than two distinct options is a question that falls back to
			// recall, which is what the application does too.
			if len(opts) >= 2 {
				options, correctIndex = opts, int32(idx)
			}
		}
		if err := s.exec(`
			INSERT INTO review_run_cards (run_id, user_id, card_id, position,
			                              options, correct_index)
			VALUES ($1, $2, $3, $4, $5::text[], $6)`,
			runID, s.user, q.ID, int32(i+1), options, correctIndex); err != nil {
			return err
		}

		if i >= answered {
			continue
		}
		rating := "lupa"
		if i < correct {
			rating = "ingat"
		}
		// An answer inside a set does not move the ladder, so the two interval
		// columns are written equal — the same thing InsertSetAnswer does.
		at := started.Add(time.Duration(i) * 43 * time.Second)
		if err := s.exec(`
			INSERT INTO review_logs (card_id, user_id, rating,
			                         interval_before, interval_after,
			                         reviewed_at, source, run_id, format)
			VALUES ($1, $2, $3, $4, $4, $5, 'set', $6, $7)`,
			q.ID, s.user, rating, int32(srs.Intervals[s.rng.Intn(4)]), at, runID, set.Format); err != nil {
			return err
		}
		s.count("review logs", 1)
	}

	s.count("review runs", 1)
	return nil
}

// --- helpers -------------------------------------------------------------

// historyDays and sessionDays are how far back the generated history reaches.
// Long enough that the 90-day interval on a mastered card is not obviously
// impossible, short enough that every list still fits on one page.
const (
	historyDays = 70
	sessionDays = 56
)

func (s *demoSeeder) domainID(slug string) any {
	if slug == "" {
		return nil
	}
	id, ok := s.domains[slug]
	if !ok {
		return nil
	}
	return id
}

// startOfDay is local midnight. Dates in this application are local
// YYYY-MM-DD and an 11pm session belongs to that day (hard rule 5).
func startOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

// daysAgo is a timestamp n days back at the given hour, with the minutes
// jittered so that a list of them does not read as generated.
func (s *demoSeeder) daysAgo(n, hour int) time.Time {
	return s.dayAt(n, hour, s.rng.Intn(60))
}

func (s *demoSeeder) dayAt(daysAgo, hour, minute int) time.Time {
	return s.today.AddDate(0, 0, -daysAgo).
		Add(time.Duration(hour)*time.Hour + time.Duration(minute)*time.Minute)
}

func (s *demoSeeder) liveCards() []seededCard {
	out := make([]seededCard, 0, len(s.cards))
	for _, c := range s.cards {
		if !c.Deleted {
			out = append(out, c)
		}
	}
	return out
}

// eligible is the seeder's version of the set draw: OR inside each group, AND
// between the two (D-077). Empty groups match everything.
func (s *demoSeeder) eligible(domains, categories []string) []seededCard {
	var out []seededCard
	for _, c := range s.liveCards() {
		if len(domains) > 0 && !contains(domains, c.Domain) {
			continue
		}
		if len(categories) > 0 && !overlaps(categories, c.Categories) {
			continue
		}
		out = append(out, c)
	}
	return out
}

// sample draws n distinct cards. Distinct matters: review_logs has a unique
// index on (run_id, card_id), so a run that drew the same card twice would
// lose one of its answers.
func (s *demoSeeder) sample(pool []seededCard, n int) []seededCard {
	if n >= len(pool) {
		n = len(pool)
	}
	idx := s.rng.Perm(len(pool))[:n]
	out := make([]seededCard, 0, n)
	for _, i := range idx {
		out = append(out, pool[i])
	}
	return out
}

func (s *demoSeeder) backs() []string { return backsOf(s.liveCards()) }

func backsOf(cards []seededCard) []string {
	out := make([]string, 0, len(cards))
	for _, c := range cards {
		if c.Back != "" {
			out = append(out, c.Back)
		}
	}
	return out
}

// choices builds a multiple-choice question: the real answer plus up to three
// distractors taken from other cards' backs, shuffled, with the index of the
// right one returned alongside (D-076).
func (s *demoSeeder) choices(correct string, pool []string) ([]string, int) {
	opts := []string{correct}
	for _, i := range s.rng.Perm(len(pool)) {
		if len(opts) == 4 {
			break
		}
		if pool[i] == correct || contains(opts, pool[i]) {
			continue
		}
		opts = append(opts, pool[i])
	}
	s.rng.Shuffle(len(opts), func(i, j int) { opts[i], opts[j] = opts[j], opts[i] })
	for i, o := range opts {
		if o == correct {
			return opts, i
		}
	}
	return opts, 0
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

func overlaps(a, b []string) bool {
	for _, x := range a {
		if contains(b, x) {
			return true
		}
	}
	return false
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
