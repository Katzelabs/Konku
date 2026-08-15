package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Katzelabs/Konku/internal/srs"
)

type setBody struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Selection     string   `json:"selection"`
	QuestionCount *int32   `json:"questionCount"`
	Format        string   `json:"format"`
	DomainIDs     []string `json:"domainIds"`
	CategoryIDs   []string `json:"categoryIds"`
	RunCount      int64    `json:"runCount"`
}

type questionBody struct {
	Position int32    `json:"position"`
	CardID   string   `json:"cardId"`
	Front    string   `json:"front"`
	Rating   *string  `json:"rating"`
	Options  []string `json:"options"`
	Missing  bool     `json:"missing"`
}

type runBody struct {
	ID           string         `json:"id"`
	SetID        string         `json:"setId"`
	FinishedAt   *string        `json:"finishedAt"`
	RunDate      string         `json:"runDate"`
	TotalCount   int32          `json:"totalCount"`
	CorrectCount int32          `json:"correctCount"`
	Questions    []questionBody `json:"questions"`
}

// answerBody is what a graded answer hands back. For a recall question only
// rating is set; a choice question also reveals, because the user has
// committed by then.
type answerBody struct {
	Rating       string  `json:"rating"`
	Back         *string `json:"back"`
	CorrectIndex *int32  `json:"correctIndex"`
}

func today() string { return string(srs.Today(time.Now())) }

// seedCards creates n standalone cards and returns them. They used to be
// `Q :: A` lines inside one note; a card is its own row now (D-055), and the
// domain is the card's own rather than one it inherited from a note.
func (c *testClient) seedCards(n int, domainID *string) []cardBody {
	c.t.Helper()

	out := make([]cardBody, 0, n)
	for i := range n {
		body := map[string]any{
			"front": string(rune('A' + i)),
			"back":  "jawaban " + string(rune('A'+i)),
		}
		if domainID != nil {
			body["domainId"] = *domainID
		}
		out = append(out, c.createCard(body))
	}
	return out
}

func (c *testClient) createSet(body map[string]any) setBody {
	c.t.Helper()
	var s setBody
	c.expect(c.do(http.MethodPost, "/review/sets", body), http.StatusCreated, &s)
	return s
}

func (c *testClient) startRun(setID string, want int) runBody {
	c.t.Helper()
	var a runBody
	c.expect(c.do(http.MethodPost, "/review/sets/"+setID+"/runs",
		map[string]any{"runDate": today()}), want, &a)
	return a
}

// answer submits a recall rating and returns the graded result.
func (c *testClient) answer(runID, cardID string, body map[string]any) answerBody {
	c.t.Helper()
	var got answerBody
	c.expect(c.do(http.MethodPost, "/review/runs/"+runID+"/"+cardID, body),
		http.StatusOK, &got)
	return got
}

// TestSetAnswerDoesNotMoveTheSchedule is D-049's whole point, and the thing
// most likely to be "fixed" back into a bug later. A practice run is not the
// scheduled queue: rating a card here must not advance the ladder, and a `lupa`
// must not reset a month of real progress (rule 6).
func TestSetAnswerDoesNotMoveTheSchedule(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(2, nil)
	set := c.createSet(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 2,
	})
	run := c.startRun(set.ID, http.StatusCreated)

	type schedule struct {
		stage  int32
		lapses int32
		due    *string
	}
	read := func(cardID string) schedule {
		t.Helper()
		var s schedule
		if err := c.scanAs(
			`SELECT stage, lapses, next_review_date::text FROM card_schedules
			  WHERE card_id = $1`,
			[]any{cardID}, &s.stage, &s.lapses, &s.due); err != nil {
			t.Fatalf("reading schedule: %v", err)
		}
		return s
	}

	before := make(map[string]schedule, len(run.Questions))
	for _, q := range run.Questions {
		before[q.CardID] = read(q.CardID)
	}

	// Answer everything wrong — the harshest case for the schedule.
	for _, q := range run.Questions {
		c.answer(run.ID, q.CardID, map[string]any{"rating": "lupa"})
	}

	for _, q := range run.Questions {
		got, want := read(q.CardID), before[q.CardID]
		if got.stage != want.stage || got.lapses != want.lapses {
			t.Errorf("card %s: schedule moved to stage=%d lapses=%d, want stage=%d lapses=%d — a set answer must not touch the ladder (D-049)",
				q.CardID, got.stage, got.lapses, want.stage, want.lapses)
		}
	}

	// The answers are still recorded as retention evidence, tagged as a set.
	var fromSet, fromDue int
	if err := c.scanAs(
		`SELECT count(*) FILTER (WHERE source = 'set'),
		        count(*) FILTER (WHERE source = 'due')
		   FROM review_logs WHERE user_id = $1`,
		[]any{c.userID}, &fromSet, &fromDue); err != nil {
		t.Fatalf("reading review_logs: %v", err)
	}
	if fromSet != 2 {
		t.Errorf("set-sourced review_logs = %d, want 2 — the answers were not logged (D-029)", fromSet)
	}
	if fromDue != 0 {
		t.Errorf("due-sourced logs = %d, want 0 — a set answer was logged as a scheduled review", fromDue)
	}
}

// A run survives a closed tab. Without the snapshot a random draw exists only
// in memory, so resuming would silently hand back a different set (D-050).
func TestRunResumesWithTheSameQuestions(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(6, nil)
	set := c.createSet(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 3,
	})

	first := c.startRun(set.ID, http.StatusCreated)
	if len(first.Questions) != 3 {
		t.Fatalf("drew %d questions, want 3", len(first.Questions))
	}

	// Answer one, then "close the tab" and start again.
	q := first.Questions[0]
	c.answer(first.ID, q.CardID, map[string]any{"rating": "ingat"})

	// 200, not 201: this is the same run carried on, not a new one.
	resumed := c.startRun(set.ID, http.StatusOK)
	if resumed.ID != first.ID {
		t.Fatalf("resumed run id = %s, want %s — a second run was created", resumed.ID, first.ID)
	}
	if len(resumed.Questions) != 3 {
		t.Fatalf("resumed with %d questions, want 3", len(resumed.Questions))
	}
	for i, got := range resumed.Questions {
		want := first.Questions[i]
		if got.CardID != want.CardID || got.Position != want.Position {
			t.Errorf("question %d = %s@%d, want %s@%d — the draw was not snapshotted",
				i, got.CardID, got.Position, want.CardID, want.Position)
		}
	}

	answered := 0
	for _, got := range resumed.Questions {
		if got.Rating != nil {
			answered++
		}
	}
	if answered != 1 {
		t.Errorf("%d questions come back answered, want 1", answered)
	}
}

// Recall before reveal applies to a set exactly as it does to the due queue
// (D-003).
func TestSetQuestionsHideTheAnswer(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(1, nil)
	set := c.createSet(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 1,
	})
	run := c.startRun(set.ID, http.StatusCreated)

	raw := c.expect(c.do(http.MethodGet, "/review/runs/"+run.ID, nil), http.StatusOK, nil)
	if contains(raw, "jawaban") {
		t.Fatalf("the question list carried the answer: %s", raw)
	}

	q := run.Questions[0]
	var answer struct {
		Back string `json:"back"`
	}
	c.expect(c.do(http.MethodGet, "/review/runs/"+run.ID+"/"+q.CardID+"/answer", nil),
		http.StatusOK, &answer)
	if !contains(answer.Back, "jawaban") {
		t.Errorf("back = %q, want the stored answer", answer.Back)
	}
}

// Scores are computed server-side from what was drawn and what was logged, so
// a client cannot report its own result.
func TestFinishScoresTheRun(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(4, nil)
	set := c.createSet(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 4,
	})
	run := c.startRun(set.ID, http.StatusCreated)

	for i, q := range run.Questions {
		rating := "lupa"
		if i < 3 {
			rating = "ingat"
		}
		c.answer(run.ID, q.CardID, map[string]any{"rating": rating})
	}

	var finished runBody
	c.expect(c.do(http.MethodPost, "/review/runs/"+run.ID+"/finish", nil), http.StatusOK, &finished)
	if finished.CorrectCount != 3 || finished.TotalCount != 4 {
		t.Fatalf("score = %d/%d, want 3/4", finished.CorrectCount, finished.TotalCount)
	}
	if finished.FinishedAt == nil {
		t.Error("finishedAt is null on a finished run")
	}

	// Finishing twice is a double-tap, not an error.
	c.expect(c.do(http.MethodPost, "/review/runs/"+run.ID+"/finish", nil), http.StatusOK, nil)

	// And a finished run takes no more answers.
	q := run.Questions[0]
	res := c.do(http.MethodPost, "/review/runs/"+run.ID+"/"+q.CardID,
		map[string]any{"rating": "ingat"})
	if res.StatusCode != http.StatusConflict {
		t.Errorf("status = %d, want 409 answering a finished run", res.StatusCode)
	}
}

// A double-clicked rating must not inflate the score. The partial unique index
// added in 00003 makes the insert idempotent.
func TestAnsweringTwiceIsIdempotent(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(2, nil)
	set := c.createSet(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 2,
	})
	run := c.startRun(set.ID, http.StatusCreated)

	q := run.Questions[0]
	for range 3 {
		c.answer(run.ID, q.CardID, map[string]any{"rating": "ingat"})
	}

	var logs int
	if err := c.scanAs(
		`SELECT count(*) FROM review_logs WHERE run_id = $1`,
		[]any{run.ID}, &logs); err != nil {
		t.Fatalf("counting logs: %v", err)
	}
	if logs != 1 {
		t.Fatalf("review_logs rows = %d, want 1 — a double submit was recorded twice", logs)
	}

	var finished runBody
	c.expect(c.do(http.MethodPost, "/review/runs/"+run.ID+"/finish", nil), http.StatusOK, &finished)
	if finished.CorrectCount != 1 || finished.TotalCount != 2 {
		t.Errorf("score = %d/%d, want 1/2", finished.CorrectCount, finished.TotalCount)
	}
}

// A random set scoped to a domain must only draw from that domain.
func TestRandomDrawRespectsTheDomain(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	math := c.domainID("math")
	inDomain := c.seedCards(3, &math)
	c.seedCards(3, nil) // untagged, must never be drawn

	inDomainIDs := make(map[string]bool, len(inDomain))
	for _, card := range inDomain {
		inDomainIDs[card.ID] = true
	}

	set := c.createSet(map[string]any{
		"title": "Matematika", "selection": "random", "questionCount": 10,
		"domainIds": []string{math},
	})
	run := c.startRun(set.ID, http.StatusCreated)

	if len(run.Questions) != 3 {
		t.Fatalf("drew %d questions, want 3 — the draw escaped the domain", len(run.Questions))
	}
	for _, q := range run.Questions {
		if !inDomainIDs[q.CardID] {
			t.Errorf("drew card %s from outside the domain", q.CardID)
		}
	}
}

// Domains are OR'd against each other: a set naming two draws from both.
func TestDrawRespectsMultipleDomains(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	math := c.domainID("math")
	music := c.domainID("music")
	c.seedCards(2, &math)
	c.seedCards(2, &music)
	c.seedCards(2, nil) // untagged, must never be drawn

	set := c.createSet(map[string]any{
		"title": "Dua domain", "selection": "random", "questionCount": 20,
		"domainIds": []string{math, music},
	})
	run := c.startRun(set.ID, http.StatusCreated)

	if len(run.Questions) != 4 {
		t.Fatalf("drew %d questions, want 4 — both domains and nothing else", len(run.Questions))
	}
}

// Categories narrow the draw, and they narrow it *with* the domain rather than
// alongside it: picking a domain and a category means cards that are both.
func TestDrawRespectsCategories(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	rumus := c.createCategory("rumus").ID

	tagged := c.createCard(map[string]any{
		"front": "tagged", "back": "jawaban tagged",
		"categoryIds": []string{rumus},
	})
	c.createCard(map[string]any{"front": "untagged", "back": "jawaban untagged"})

	set := c.createSet(map[string]any{
		"title": "Rumus", "selection": "random", "questionCount": 20,
		"categoryIds": []string{rumus},
	})
	run := c.startRun(set.ID, http.StatusCreated)

	if len(run.Questions) != 1 {
		t.Fatalf("drew %d questions, want 1 — the category filter did not apply", len(run.Questions))
	}
	if run.Questions[0].CardID != tagged.ID {
		t.Errorf("drew %s, want the categorised card %s", run.Questions[0].CardID, tagged.ID)
	}
}

// Options are snapshotted with the draw (D-050/D-077). Regenerating them on
// resume would mean the second half of a run answers a different question from
// the first.
func TestChoiceOptionsAreSnapshotted(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(8, nil)
	set := c.createSet(map[string]any{
		"title": "Pilihan ganda", "selection": "random", "questionCount": 4,
		"format": "choice",
	})

	first := c.startRun(set.ID, http.StatusCreated)
	for _, q := range first.Questions {
		if len(q.Options) != 4 {
			t.Fatalf("question %s has %d options, want 4", q.CardID, len(q.Options))
		}
	}

	// Answer one, then resume.
	c.answer(first.ID, first.Questions[0].CardID, map[string]any{"choice": 0})

	resumed := c.startRun(set.ID, http.StatusOK)
	for i, got := range resumed.Questions {
		want := first.Questions[i]
		if got.CardID != want.CardID {
			t.Fatalf("question %d is a different card on resume", i)
		}
		if strings.Join(got.Options, "\x00") != strings.Join(want.Options, "\x00") {
			t.Errorf("question %d options changed on resume:\n got %q\nwant %q — options must be snapshotted",
				i, got.Options, want.Options)
		}
	}
}

// The option list ships; which one is right does not. Otherwise the answer key
// is one dev-tools glance away and the question asks nothing (D-003).
func TestCorrectIndexIsNeverSerialized(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(8, nil)
	set := c.createSet(map[string]any{
		"title": "Pilihan ganda", "selection": "random", "questionCount": 4,
		"format": "choice",
	})
	run := c.startRun(set.ID, http.StatusCreated)

	raw := c.expect(c.do(http.MethodGet, "/review/runs/"+run.ID, nil), http.StatusOK, nil)
	if contains(raw, "correctIndex") {
		t.Fatalf("the question list carried the answer key: %s", raw)
	}

	// It only appears once the user has committed to an option.
	got := c.answer(run.ID, run.Questions[0].CardID, map[string]any{"choice": 0})
	if got.CorrectIndex == nil {
		t.Error("answering a choice question did not reveal the correct option")
	}
	if got.Back == nil || *got.Back == "" {
		t.Error("answering a choice question did not reveal the answer")
	}
}

// A choice answer is graded on the server, tagged so retention can tell
// recognition from recall (D-077), and still does not move the schedule.
func TestChoiceAnswerIsTaggedAndDoesNotMoveTheSchedule(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(8, nil)
	set := c.createSet(map[string]any{
		"title": "Pilihan ganda", "selection": "random", "questionCount": 4,
		"format": "choice",
	})
	run := c.startRun(set.ID, http.StatusCreated)

	// Read the stored key directly so the test can answer one right and one
	// wrong without depending on option order.
	q := run.Questions[0]
	var correct int32
	if err := c.scanAs(
		`SELECT correct_index FROM review_run_cards WHERE run_id = $1 AND card_id = $2`,
		[]any{run.ID, q.CardID}, &correct); err != nil {
		t.Fatalf("reading the stored key: %v", err)
	}

	got := c.answer(run.ID, q.CardID, map[string]any{"choice": correct})
	if got.Rating != "ingat" {
		t.Errorf("rating = %q, want ingat for the correct option", got.Rating)
	}

	wrong := run.Questions[1]
	var wrongKey int32
	if err := c.scanAs(
		`SELECT correct_index FROM review_run_cards WHERE run_id = $1 AND card_id = $2`,
		[]any{run.ID, wrong.CardID}, &wrongKey); err != nil {
		t.Fatalf("reading the stored key: %v", err)
	}
	got = c.answer(run.ID, wrong.CardID, map[string]any{"choice": (wrongKey + 1) % 4})
	if got.Rating != "lupa" {
		t.Errorf("rating = %q, want lupa for a wrong option", got.Rating)
	}

	var choiceLogs, recallLogs int
	if err := c.scanAs(
		`SELECT count(*) FILTER (WHERE format = 'choice'),
		        count(*) FILTER (WHERE format = 'recall')
		   FROM review_logs WHERE user_id = $1`,
		[]any{c.userID}, &choiceLogs, &recallLogs); err != nil {
		t.Fatalf("reading review_logs: %v", err)
	}
	if choiceLogs != 2 {
		t.Errorf("choice-tagged logs = %d, want 2 — retention cannot tell recognition from recall", choiceLogs)
	}
	if recallLogs != 0 {
		t.Errorf("recall-tagged logs = %d, want 0", recallLogs)
	}

	// The ladder is untouched, same as any other set answer (D-049).
	var moved int
	if err := c.scanAs(
		`SELECT count(*) FROM card_schedules WHERE user_id = $1 AND stage <> 0`,
		[]any{c.userID}, &moved); err != nil {
		t.Fatalf("reading schedules: %v", err)
	}
	if moved != 0 {
		t.Errorf("%d schedules moved, want 0", moved)
	}
}

// A choice question cannot be graded from a self-reported rating: that would
// let anyone score full marks without reading the options.
func TestChoiceQuestionRejectsASelfRating(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(8, nil)
	set := c.createSet(map[string]any{
		"title": "Pilihan ganda", "selection": "random", "questionCount": 2,
		"format": "choice",
	})
	run := c.startRun(set.ID, http.StatusCreated)

	res := c.do(http.MethodPost, "/review/runs/"+run.ID+"/"+run.Questions[0].CardID,
		map[string]any{"rating": "ingat"})
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 rating a choice question", res.StatusCode)
	}

	res = c.do(http.MethodPost, "/review/runs/"+run.ID+"/"+run.Questions[0].CardID,
		map[string]any{"choice": 99})
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for an option that does not exist", res.StatusCode)
	}
}

// A set whose filters match too few cards to build options widens the pool to
// the whole account rather than dropping the format (D-077).
//
// This is the regression test for a real bug: the widening pass called the
// pool query with nil filter slices, pgx encoded those as SQL NULL rather than
// '{}', and cardinality(NULL) = 0 is NULL — so the "no filter" branch went
// false and the widened pool came back empty. Every narrow choice set silently
// degraded to recall. TestChoiceFallsBackToRecall could not catch it, because
// falling back is what that test asserts.
func TestChoiceWidensThePoolWhenFiltersAreNarrow(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	rumus := c.createCategory("rumus").ID
	c.createCard(map[string]any{
		"front": "satu-satunya", "back": "jawaban satu-satunya",
		"categoryIds": []string{rumus},
	})
	// Plenty of other cards, none of them in the category.
	c.seedCards(8, nil)

	set := c.createSet(map[string]any{
		"title": "Sempit", "selection": "random", "questionCount": 5,
		"format": "choice", "categoryIds": []string{rumus},
	})
	run := c.startRun(set.ID, http.StatusCreated)

	if len(run.Questions) != 1 {
		t.Fatalf("drew %d questions, want 1 — the filter did not apply", len(run.Questions))
	}
	if got := len(run.Questions[0].Options); got != 4 {
		t.Fatalf("got %d options, want 4 — the pool did not widen past the filter", got)
	}
}

// An account too small to fill four options still gets to press "mulai" — the
// question degrades to recall rather than the run refusing to start (D-077).
func TestChoiceFallsBackToRecall(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(2, nil)
	set := c.createSet(map[string]any{
		"title": "Terlalu sedikit", "selection": "random", "questionCount": 2,
		"format": "choice",
	})
	run := c.startRun(set.ID, http.StatusCreated)

	if len(run.Questions) != 2 {
		t.Fatalf("drew %d questions, want 2", len(run.Questions))
	}
	for _, q := range run.Questions {
		if len(q.Options) != 0 {
			t.Errorf("question %s got %d options from a 2-card account, want none",
				q.CardID, len(q.Options))
		}
	}

	// And it takes a plain rating, because that is what it now is.
	c.answer(run.ID, run.Questions[0].CardID, map[string]any{"rating": "ingat"})
}

// Discarding a run must not erase retention evidence (D-050).
func TestDiscardingARunKeepsTheAnswers(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(2, nil)
	set := c.createSet(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 2,
	})
	run := c.startRun(set.ID, http.StatusCreated)

	q := run.Questions[0]
	c.answer(run.ID, q.CardID, map[string]any{"rating": "ingat"})

	c.expect(c.do(http.MethodDelete, "/review/runs/"+run.ID, nil), http.StatusNoContent, nil)

	var kept, snapshot int
	if err := c.scanAs(
		`SELECT (SELECT count(*) FROM review_logs WHERE user_id = $1 AND source = 'set'),
		        (SELECT count(*) FROM review_run_cards WHERE run_id = $2)`,
		[]any{c.userID, run.ID}, &kept, &snapshot); err != nil {
		t.Fatalf("reading state: %v", err)
	}
	if kept != 1 {
		t.Errorf("set answers left = %d, want 1 — discarding a run erased retention history", kept)
	}
	if snapshot != 0 {
		t.Errorf("snapshot rows left = %d, want 0", snapshot)
	}
}

func TestReviewSetsAreIsolatedPerUser(t *testing.T) {
	app := newApp(t)
	a := app.newClient(t)
	b := app.newClient(t)

	a.seedCards(2, nil)
	set := a.createSet(map[string]any{
		"title": "Punya A", "selection": "random", "questionCount": 2,
	})

	for _, tt := range []struct {
		name, method, path string
	}{
		{"read", http.MethodGet, "/review/sets/" + set.ID},
		{"edit", http.MethodPatch, "/review/sets/" + set.ID},
		{"start", http.MethodPost, "/review/sets/" + set.ID + "/runs"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			res := b.do(tt.method, tt.path, map[string]any{"title": "x", "runDate": today()})
			if res.StatusCode != http.StatusNotFound {
				t.Errorf("status = %d, want 404", res.StatusCode)
			}
		})
	}
}

func TestReviewSetValidation(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	tests := []struct {
		name string
		body map[string]any
	}{
		{"no title", map[string]any{"selection": "random", "questionCount": 5}},
		{"an unknown selection", map[string]any{"title": "x", "selection": "essay"}},
		{"random without a count", map[string]any{"title": "x", "selection": "random"}},
		{"zero questions", map[string]any{"title": "x", "selection": "random", "questionCount": 0}},
		{"too many questions", map[string]any{"title": "x", "selection": "random", "questionCount": 5000}},
		{"an unknown format", map[string]any{"title": "x", "selection": "random", "questionCount": 5, "format": "essay"}},
		{"an unknown domain", map[string]any{"title": "x", "selection": "random", "questionCount": 5, "domainIds": []string{"astrologi"}}},
		{"an implausible time limit", map[string]any{"title": "x", "selection": "random", "questionCount": 5, "timeLimitMinutes": 9000}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := c.do(http.MethodPost, "/review/sets", tt.body)
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", res.StatusCode)
			}
		})
	}

	// An account with no cards yet is a normal state, not a server error. So is
	// a filter combination that happens to match nothing.
	t.Run("starting a run with nothing to ask is a 400", func(t *testing.T) {
		set := c.createSet(map[string]any{
			"title": "Kosong", "selection": "random", "questionCount": 5,
		})
		res := c.do(http.MethodPost, "/review/sets/"+set.ID+"/runs",
			map[string]any{"runDate": today()})
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", res.StatusCode)
		}
	})
}

// A set that has been run cannot be deleted — that would destroy the score
// history while the answers survive in review_logs (D-051). Archiving is the
// way out, and unlike an exam it can be undone.
func TestDeleteReviewSetOnlyBeforeItIsRun(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(2, nil)

	unrun := c.createSet(map[string]any{
		"title": "Belum dipakai", "selection": "random", "questionCount": 2,
	})
	c.expect(c.do(http.MethodDelete, "/review/sets/"+unrun.ID, nil), http.StatusNoContent, nil)

	run := c.createSet(map[string]any{
		"title": "Sudah dipakai", "selection": "random", "questionCount": 2,
	})
	c.startRun(run.ID, http.StatusCreated)

	res := c.do(http.MethodDelete, "/review/sets/"+run.ID, nil)
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", res.StatusCode)
	}

	// Archiving takes the set off the list.
	c.expect(c.do(http.MethodPost, "/review/sets/"+run.ID+"/archive", nil), http.StatusOK, nil)
	var sets pageBody[setBody]
	c.expect(c.do(http.MethodGet, "/review/sets", nil), http.StatusOK, &sets)
	for _, e := range sets.Items {
		if e.ID == run.ID {
			t.Error("an archived set is still listed")
		}
	}

	// And it comes back, which an exam could never do.
	c.expect(c.do(http.MethodPost, "/review/sets/"+run.ID+"/unarchive", nil), http.StatusOK, nil)
	c.expect(c.do(http.MethodGet, "/review/sets", nil), http.StatusOK, &sets)
	found := false
	for _, e := range sets.Items {
		if e.ID == run.ID {
			found = true
		}
	}
	if !found {
		t.Error("an unarchived set did not come back to the list")
	}
}

// A fixed set asks the same questions every time, which is the only reason its
// scores are comparable across runs (D-048).
func TestFixedSetAsksThePinnedCards(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(5, nil)

	// The picker's candidate list carries prompts, never answers.
	var candidates pageBody[struct {
		CardID string `json:"id"`
		Front  string `json:"front"`
	}]
	raw := c.expect(c.do(http.MethodGet, "/cards", nil), http.StatusOK, &candidates)
	pickable := candidates.Items
	if len(pickable) != 5 {
		t.Fatalf("got %d pickable cards, want 5", len(pickable))
	}
	if contains(raw, "jawaban") {
		t.Fatalf("the card picker leaked answers: %s", raw)
	}

	set := c.createSet(map[string]any{"title": "Tetap", "selection": "fixed"})

	// Pin two of the five, in a deliberate order.
	pinned := []map[string]any{
		{"cardId": pickable[2].CardID},
		{"cardId": pickable[0].CardID},
	}
	c.expect(c.do(http.MethodPut, "/review/sets/"+set.ID+"/cards",
		map[string]any{"cards": pinned}), http.StatusNoContent, nil)

	// The detail hands the set back, so the picker can show what is on.
	var detail struct {
		Cards []struct {
			CardID string `json:"cardId"`
		} `json:"cards"`
	}
	c.expect(c.do(http.MethodGet, "/review/sets/"+set.ID, nil), http.StatusOK, &detail)
	if len(detail.Cards) != 2 {
		t.Fatalf("detail lists %d pinned cards, want 2", len(detail.Cards))
	}

	// Two runs ask the identical questions in the identical order.
	first := c.startRun(set.ID, http.StatusCreated)
	for _, q := range first.Questions {
		c.answer(first.ID, q.CardID, map[string]any{"rating": "ingat"})
	}
	c.expect(c.do(http.MethodPost, "/review/runs/"+first.ID+"/finish", nil), http.StatusOK, nil)

	second := c.startRun(set.ID, http.StatusCreated)
	if len(first.Questions) != 2 || len(second.Questions) != 2 {
		t.Fatalf("asked %d then %d questions, want 2 each", len(first.Questions), len(second.Questions))
	}
	for i := range first.Questions {
		if first.Questions[i].CardID != second.Questions[i].CardID {
			t.Errorf("question %d differs between runs (%s vs %s) — a fixed set must not vary",
				i, first.Questions[i].CardID, second.Questions[i].CardID)
		}
	}
	if first.Questions[0].CardID != pickable[2].CardID {
		t.Errorf("first question = %s, want the pinned order to be respected", first.Questions[0].CardID)
	}
}

// Replacing the set is one request, and it really replaces rather than appends.
func TestSettingReviewSetCardsReplaces(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(4, nil)
	var candidates pageBody[struct {
		CardID string `json:"id"`
	}]
	c.expect(c.do(http.MethodGet, "/cards", nil), http.StatusOK, &candidates)
	pickable := candidates.Items

	set := c.createSet(map[string]any{"title": "Tetap", "selection": "fixed"})
	pin := func(n int) {
		cards := make([]map[string]any, 0, n)
		for _, p := range pickable[:n] {
			cards = append(cards, map[string]any{"cardId": p.CardID})
		}
		c.expect(c.do(http.MethodPut, "/review/sets/"+set.ID+"/cards",
			map[string]any{"cards": cards}), http.StatusNoContent, nil)
	}

	pin(3)
	pin(1)

	var detail struct {
		Cards []struct{} `json:"cards"`
	}
	c.expect(c.do(http.MethodGet, "/review/sets/"+set.ID, nil), http.StatusOK, &detail)
	if len(detail.Cards) != 1 {
		t.Fatalf("pinned set has %d cards after replacing 3 with 1, want 1", len(detail.Cards))
	}

	// Another user's card cannot be pinned — the composite FK rejects it
	// (D-047), and the handler turns that into a 400 rather than a 500.
	other := app.newClient(t)
	other.seedCards(1, nil)
	var theirPage pageBody[struct {
		CardID string `json:"id"`
	}]
	other.expect(other.do(http.MethodGet, "/cards", nil), http.StatusOK, &theirPage)
	theirs := theirPage.Items

	res := c.do(http.MethodPut, "/review/sets/"+set.ID+"/cards", map[string]any{
		"cards": []map[string]any{{"cardId": theirs[0].CardID}},
	})
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 pinning another user's card", res.StatusCode)
	}
}

// The filters survive a round trip, and replacing them really replaces.
func TestSetFiltersRoundTrip(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	math := c.domainID("math")
	music := c.domainID("music")
	rumus := c.createCategory("rumus").ID

	set := c.createSet(map[string]any{
		"title": "Berfilter", "selection": "random", "questionCount": 5,
		"domainIds": []string{math, music}, "categoryIds": []string{rumus},
	})
	if len(set.DomainIDs) != 2 || len(set.CategoryIDs) != 1 {
		t.Fatalf("created with %d domains and %d categories, want 2 and 1",
			len(set.DomainIDs), len(set.CategoryIDs))
	}

	var got setBody
	c.expect(c.do(http.MethodPatch, "/review/sets/"+set.ID,
		map[string]any{"domainIds": []string{math}}), http.StatusOK, &got)
	if len(got.DomainIDs) != 1 || got.DomainIDs[0] != math {
		t.Errorf("domains after patch = %v, want just %s", got.DomainIDs, math)
	}
	// Categories were not in the patch body, so they stay.
	if len(got.CategoryIDs) != 1 {
		t.Errorf("categories = %v, want the untouched one kept", got.CategoryIDs)
	}
}

func contains(haystack, needle string) bool {
	return strings.Contains(haystack, needle)
}
