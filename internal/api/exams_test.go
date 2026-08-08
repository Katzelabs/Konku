package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Katzelabs/Konku/internal/srs"
)

type examBody struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	Selection     string  `json:"selection"`
	QuestionCount *int32  `json:"questionCount"`
	DomainID      *string `json:"domainId"`
	AttemptCount  int64   `json:"attemptCount"`
}

type questionBody struct {
	Position int32   `json:"position"`
	NoteID   string  `json:"noteId"`
	CardID   string  `json:"cardId"`
	Front    string  `json:"front"`
	Rating   *string `json:"rating"`
	Missing  bool    `json:"missing"`
}

type attemptBody struct {
	ID           string         `json:"id"`
	ExamID       string         `json:"examId"`
	FinishedAt   *string        `json:"finishedAt"`
	AttemptDate  string         `json:"attemptDate"`
	TotalCount   int32          `json:"totalCount"`
	CorrectCount int32          `json:"correctCount"`
	Questions    []questionBody `json:"questions"`
}

func today() string { return string(srs.Today(time.Now())) }

// seedCards writes one note carrying n cards and returns it.
func (c *testClient) seedCards(n int, domainID *string) noteBody {
	c.t.Helper()

	md := ""
	for i := range n {
		md += string(rune('A'+i)) + " :: jawaban " + string(rune('A'+i)) + "\n\n"
	}
	body := map[string]any{"title": "bank", "contentMd": md}
	if domainID != nil {
		body["domainId"] = *domainID
	}
	return c.createNote(body)
}

func (c *testClient) createExam(body map[string]any) examBody {
	c.t.Helper()
	var e examBody
	c.expect(c.do(http.MethodPost, "/exams", body), http.StatusCreated, &e)
	return e
}

func (c *testClient) startAttempt(examID string, want int) attemptBody {
	c.t.Helper()
	var a attemptBody
	c.expect(c.do(http.MethodPost, "/exams/"+examID+"/attempts",
		map[string]any{"attemptDate": today()}), want, &a)
	return a
}

// TestExamAnswerDoesNotMoveTheSchedule is D-049's whole point, and the thing
// most likely to be "fixed" back into a bug later. A practice test is not a
// review: rating a card in an exam must not advance the ladder, and a `lupa`
// must not reset a month of real progress (rule 6).
func TestExamAnswerDoesNotMoveTheSchedule(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	note := c.seedCards(2, nil)
	exam := c.createExam(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 2,
	})
	attempt := c.startAttempt(exam.ID, http.StatusCreated)

	type schedule struct {
		stage  int32
		lapses int32
		due    *string
	}
	read := func(noteID, cardID string) schedule {
		t.Helper()
		var s schedule
		if err := c.app.store.Pool().QueryRow(c.app.ctx,
			`SELECT stage, lapses, next_review_date::text FROM card_schedules
			  WHERE note_id = $1 AND card_id = $2`, noteID, cardID).
			Scan(&s.stage, &s.lapses, &s.due); err != nil {
			t.Fatalf("reading schedule: %v", err)
		}
		return s
	}

	before := make(map[string]schedule, len(attempt.Questions))
	for _, q := range attempt.Questions {
		before[q.CardID] = read(q.NoteID, q.CardID)
	}

	// Answer everything wrong — the harshest case for the schedule.
	for _, q := range attempt.Questions {
		c.expect(c.do(http.MethodPost,
			"/attempts/"+attempt.ID+"/"+q.NoteID+"/"+q.CardID,
			map[string]any{"rating": "lupa"}), http.StatusNoContent, nil)
	}

	for _, q := range attempt.Questions {
		got, want := read(q.NoteID, q.CardID), before[q.CardID]
		if got.stage != want.stage || got.lapses != want.lapses {
			t.Errorf("card %s: schedule moved to stage=%d lapses=%d, want stage=%d lapses=%d — an exam answer must not touch the ladder (D-049)",
				q.CardID, got.stage, got.lapses, want.stage, want.lapses)
		}
	}

	// The answers are still recorded as retention evidence, tagged as exam.
	var exams, reviews int
	if err := c.app.store.Pool().QueryRow(c.app.ctx,
		`SELECT count(*) FILTER (WHERE source = 'exam'),
		        count(*) FILTER (WHERE source = 'review')
		   FROM review_logs WHERE note_id = $1`, note.ID).Scan(&exams, &reviews); err != nil {
		t.Fatalf("reading review_logs: %v", err)
	}
	if exams != 2 {
		t.Errorf("exam-sourced review_logs = %d, want 2 — the answers were not logged (D-029)", exams)
	}
	if reviews != 0 {
		t.Errorf("review-sourced logs = %d, want 0 — an exam answer was logged as a review", reviews)
	}
}

// An attempt survives a closed tab. Without the snapshot a random draw exists
// only in memory, so resuming would silently hand back a different exam
// (D-050).
func TestAttemptResumesWithTheSameQuestions(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(6, nil)
	exam := c.createExam(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 3,
	})

	first := c.startAttempt(exam.ID, http.StatusCreated)
	if len(first.Questions) != 3 {
		t.Fatalf("drew %d questions, want 3", len(first.Questions))
	}

	// Answer one, then "close the tab" and start again.
	q := first.Questions[0]
	c.expect(c.do(http.MethodPost, "/attempts/"+first.ID+"/"+q.NoteID+"/"+q.CardID,
		map[string]any{"rating": "ingat"}), http.StatusNoContent, nil)

	// 200, not 201: this is the same attempt carried on, not a new one.
	resumed := c.startAttempt(exam.ID, http.StatusOK)
	if resumed.ID != first.ID {
		t.Fatalf("resumed attempt id = %s, want %s — a second attempt was created", resumed.ID, first.ID)
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

// Recall before reveal applies to exams exactly as it does to review (D-003).
func TestExamQuestionsHideTheAnswer(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(1, nil)
	exam := c.createExam(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 1,
	})
	attempt := c.startAttempt(exam.ID, http.StatusCreated)

	raw := c.expect(c.do(http.MethodGet, "/attempts/"+attempt.ID, nil), http.StatusOK, nil)
	if contains(raw, "jawaban") {
		t.Fatalf("the question list carried the answer: %s", raw)
	}

	q := attempt.Questions[0]
	var answer struct {
		Back string `json:"back"`
	}
	c.expect(c.do(http.MethodGet, "/attempts/"+attempt.ID+"/"+q.NoteID+"/"+q.CardID+"/answer", nil),
		http.StatusOK, &answer)
	if !contains(answer.Back, "jawaban") {
		t.Errorf("back = %q, want the stored answer", answer.Back)
	}
}

// Scores are computed server-side from what was drawn and what was logged, so
// a client cannot report its own result.
func TestFinishScoresTheAttempt(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(4, nil)
	exam := c.createExam(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 4,
	})
	attempt := c.startAttempt(exam.ID, http.StatusCreated)

	for i, q := range attempt.Questions {
		rating := "lupa"
		if i < 3 {
			rating = "ingat"
		}
		c.expect(c.do(http.MethodPost, "/attempts/"+attempt.ID+"/"+q.NoteID+"/"+q.CardID,
			map[string]any{"rating": rating}), http.StatusNoContent, nil)
	}

	var finished attemptBody
	c.expect(c.do(http.MethodPost, "/attempts/"+attempt.ID+"/finish", nil), http.StatusOK, &finished)
	if finished.CorrectCount != 3 || finished.TotalCount != 4 {
		t.Fatalf("score = %d/%d, want 3/4", finished.CorrectCount, finished.TotalCount)
	}
	if finished.FinishedAt == nil {
		t.Error("finishedAt is null on a finished attempt")
	}

	// Finishing twice is a double-tap, not an error.
	c.expect(c.do(http.MethodPost, "/attempts/"+attempt.ID+"/finish", nil), http.StatusOK, nil)

	// And a finished attempt takes no more answers.
	q := attempt.Questions[0]
	res := c.do(http.MethodPost, "/attempts/"+attempt.ID+"/"+q.NoteID+"/"+q.CardID,
		map[string]any{"rating": "ingat"})
	if res.StatusCode != http.StatusConflict {
		t.Errorf("status = %d, want 409 answering a finished attempt", res.StatusCode)
	}
}

// A double-clicked rating must not inflate the score. The partial unique index
// added in 00003 makes the insert idempotent.
func TestAnsweringTwiceIsIdempotent(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(2, nil)
	exam := c.createExam(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 2,
	})
	attempt := c.startAttempt(exam.ID, http.StatusCreated)

	q := attempt.Questions[0]
	for range 3 {
		c.expect(c.do(http.MethodPost, "/attempts/"+attempt.ID+"/"+q.NoteID+"/"+q.CardID,
			map[string]any{"rating": "ingat"}), http.StatusNoContent, nil)
	}

	var logs int
	if err := c.app.store.Pool().QueryRow(c.app.ctx,
		`SELECT count(*) FROM review_logs WHERE exam_attempt_id = $1`, attempt.ID).Scan(&logs); err != nil {
		t.Fatalf("counting logs: %v", err)
	}
	if logs != 1 {
		t.Fatalf("review_logs rows = %d, want 1 — a double submit was recorded twice", logs)
	}

	var finished attemptBody
	c.expect(c.do(http.MethodPost, "/attempts/"+attempt.ID+"/finish", nil), http.StatusOK, &finished)
	if finished.CorrectCount != 1 || finished.TotalCount != 2 {
		t.Errorf("score = %d/%d, want 1/2", finished.CorrectCount, finished.TotalCount)
	}
}

// A random exam scoped to a domain must only draw from that domain's notes.
func TestRandomDrawRespectsTheDomain(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	math := c.domainID("math")
	inDomain := c.seedCards(3, &math)
	c.seedCards(3, nil) // untagged, must never be drawn

	exam := c.createExam(map[string]any{
		"title": "Matematika", "selection": "random", "questionCount": 10, "domainId": math,
	})
	attempt := c.startAttempt(exam.ID, http.StatusCreated)

	if len(attempt.Questions) != 3 {
		t.Fatalf("drew %d questions, want 3 — the draw escaped the domain", len(attempt.Questions))
	}
	for _, q := range attempt.Questions {
		if q.NoteID != inDomain.ID {
			t.Errorf("drew a card from note %s, want only %s", q.NoteID, inDomain.ID)
		}
	}
}

// Discarding a run must not erase retention evidence (D-050).
func TestDiscardingAnAttemptKeepsTheAnswers(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	note := c.seedCards(2, nil)
	exam := c.createExam(map[string]any{
		"title": "Latihan", "selection": "random", "questionCount": 2,
	})
	attempt := c.startAttempt(exam.ID, http.StatusCreated)

	q := attempt.Questions[0]
	c.expect(c.do(http.MethodPost, "/attempts/"+attempt.ID+"/"+q.NoteID+"/"+q.CardID,
		map[string]any{"rating": "ingat"}), http.StatusNoContent, nil)

	c.expect(c.do(http.MethodDelete, "/attempts/"+attempt.ID, nil), http.StatusNoContent, nil)

	var kept, snapshot int
	if err := c.app.store.Pool().QueryRow(c.app.ctx,
		`SELECT (SELECT count(*) FROM review_logs WHERE note_id = $1 AND source = 'exam'),
		        (SELECT count(*) FROM exam_attempt_cards WHERE attempt_id = $2)`,
		note.ID, attempt.ID).Scan(&kept, &snapshot); err != nil {
		t.Fatalf("reading state: %v", err)
	}
	if kept != 1 {
		t.Errorf("exam answers left = %d, want 1 — discarding a run erased retention history", kept)
	}
	if snapshot != 0 {
		t.Errorf("snapshot rows left = %d, want 0", snapshot)
	}
}

func TestExamsAreIsolatedPerUser(t *testing.T) {
	app := newApp(t)
	a := app.newClient(t)
	b := app.newClient(t)

	a.seedCards(2, nil)
	exam := a.createExam(map[string]any{
		"title": "Punya A", "selection": "random", "questionCount": 2,
	})

	for _, tt := range []struct {
		name, method, path string
	}{
		{"read", http.MethodGet, "/exams/" + exam.ID},
		{"edit", http.MethodPatch, "/exams/" + exam.ID},
		{"start", http.MethodPost, "/exams/" + exam.ID + "/attempts"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			res := b.do(tt.method, tt.path, map[string]any{"title": "x", "attemptDate": today()})
			if res.StatusCode != http.StatusNotFound {
				t.Errorf("status = %d, want 404", res.StatusCode)
			}
		})
	}
}

func TestExamValidation(t *testing.T) {
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
		{"an unknown domain", map[string]any{"title": "x", "selection": "random", "questionCount": 5, "domainId": "astrologi"}},
		{"an implausible time limit", map[string]any{"title": "x", "selection": "random", "questionCount": 5, "timeLimitMinutes": 9000}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := c.do(http.MethodPost, "/exams", tt.body)
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", res.StatusCode)
			}
		})
	}

	// An account with no cards yet is a normal state, not a server error.
	t.Run("starting an exam with nothing to ask is a 400", func(t *testing.T) {
		exam := c.createExam(map[string]any{
			"title": "Kosong", "selection": "random", "questionCount": 5,
		})
		res := c.do(http.MethodPost, "/exams/"+exam.ID+"/attempts",
			map[string]any{"attemptDate": today()})
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", res.StatusCode)
		}
	})
}

// An exam that has been sat cannot be deleted — that would destroy the score
// history while the answers survive in review_logs (D-051).
func TestDeleteExamOnlyBeforeItIsSat(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(2, nil)

	unsat := c.createExam(map[string]any{
		"title": "Belum dipakai", "selection": "random", "questionCount": 2,
	})
	c.expect(c.do(http.MethodDelete, "/exams/"+unsat.ID, nil), http.StatusNoContent, nil)

	sat := c.createExam(map[string]any{
		"title": "Sudah dipakai", "selection": "random", "questionCount": 2,
	})
	c.startAttempt(sat.ID, http.StatusCreated)

	res := c.do(http.MethodDelete, "/exams/"+sat.ID, nil)
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", res.StatusCode)
	}

	// Archiving is the way out, and it takes the exam off the list.
	c.expect(c.do(http.MethodPost, "/exams/"+sat.ID+"/archive", nil), http.StatusOK, nil)
	var exams []examBody
	c.expect(c.do(http.MethodGet, "/exams", nil), http.StatusOK, &exams)
	for _, e := range exams {
		if e.ID == sat.ID {
			t.Error("an archived exam is still listed")
		}
	}
}

// A fixed exam asks the same questions every time, which is the only reason
// its scores are comparable across attempts (D-048).
func TestFixedExamAsksThePinnedSet(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	note := c.seedCards(5, nil)

	// The picker's candidate list carries prompts, never answers.
	var pickable []struct {
		NoteID    string `json:"noteId"`
		CardID    string `json:"cardId"`
		Front     string `json:"front"`
		NoteTitle string `json:"noteTitle"`
	}
	raw := c.expect(c.do(http.MethodGet, "/cards", nil), http.StatusOK, &pickable)
	if len(pickable) != 5 {
		t.Fatalf("got %d pickable cards, want 5", len(pickable))
	}
	if contains(raw, "jawaban") {
		t.Fatalf("the card picker leaked answers: %s", raw)
	}

	exam := c.createExam(map[string]any{"title": "Tetap", "selection": "fixed"})

	// Pin two of the five, in a deliberate order.
	pinned := []map[string]any{
		{"noteId": pickable[2].NoteID, "cardId": pickable[2].CardID},
		{"noteId": pickable[0].NoteID, "cardId": pickable[0].CardID},
	}
	c.expect(c.do(http.MethodPut, "/exams/"+exam.ID+"/cards",
		map[string]any{"cards": pinned}), http.StatusNoContent, nil)

	// The exam detail hands the set back, so the picker can show what is on.
	var detail struct {
		Cards []struct {
			CardID string `json:"cardId"`
		} `json:"cards"`
	}
	c.expect(c.do(http.MethodGet, "/exams/"+exam.ID, nil), http.StatusOK, &detail)
	if len(detail.Cards) != 2 {
		t.Fatalf("exam detail lists %d pinned cards, want 2", len(detail.Cards))
	}

	// Two sittings ask the identical questions in the identical order.
	first := c.startAttempt(exam.ID, http.StatusCreated)
	for _, q := range first.Questions {
		c.expect(c.do(http.MethodPost, "/attempts/"+first.ID+"/"+q.NoteID+"/"+q.CardID,
			map[string]any{"rating": "ingat"}), http.StatusNoContent, nil)
	}
	c.expect(c.do(http.MethodPost, "/attempts/"+first.ID+"/finish", nil), http.StatusOK, nil)

	second := c.startAttempt(exam.ID, http.StatusCreated)
	if len(first.Questions) != 2 || len(second.Questions) != 2 {
		t.Fatalf("asked %d then %d questions, want 2 each", len(first.Questions), len(second.Questions))
	}
	for i := range first.Questions {
		if first.Questions[i].CardID != second.Questions[i].CardID {
			t.Errorf("question %d differs between attempts (%s vs %s) — a fixed exam must not vary",
				i, first.Questions[i].CardID, second.Questions[i].CardID)
		}
	}
	if first.Questions[0].CardID != pickable[2].CardID {
		t.Errorf("first question = %s, want the pinned order to be respected", first.Questions[0].CardID)
	}
	_ = note
}

// Replacing the set is one request, and it really replaces rather than appends.
func TestSettingExamCardsReplaces(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	c.seedCards(4, nil)
	var pickable []struct {
		NoteID string `json:"noteId"`
		CardID string `json:"cardId"`
	}
	c.expect(c.do(http.MethodGet, "/cards", nil), http.StatusOK, &pickable)

	exam := c.createExam(map[string]any{"title": "Tetap", "selection": "fixed"})
	set := func(n int) {
		cards := make([]map[string]any, 0, n)
		for _, p := range pickable[:n] {
			cards = append(cards, map[string]any{"noteId": p.NoteID, "cardId": p.CardID})
		}
		c.expect(c.do(http.MethodPut, "/exams/"+exam.ID+"/cards",
			map[string]any{"cards": cards}), http.StatusNoContent, nil)
	}

	set(3)
	set(1)

	var detail struct {
		Cards []struct{} `json:"cards"`
	}
	c.expect(c.do(http.MethodGet, "/exams/"+exam.ID, nil), http.StatusOK, &detail)
	if len(detail.Cards) != 1 {
		t.Fatalf("pinned set has %d cards after replacing 3 with 1, want 1", len(detail.Cards))
	}

	// Another user's card cannot be pinned — the composite FK rejects it
	// (D-047), and the handler turns that into a 400 rather than a 500.
	other := app.newClient(t)
	other.seedCards(1, nil)
	var theirs []struct {
		NoteID string `json:"noteId"`
		CardID string `json:"cardId"`
	}
	other.expect(other.do(http.MethodGet, "/cards", nil), http.StatusOK, &theirs)

	res := c.do(http.MethodPut, "/exams/"+exam.ID+"/cards", map[string]any{
		"cards": []map[string]any{{"noteId": theirs[0].NoteID, "cardId": theirs[0].CardID}},
	})
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 pinning another user's card", res.StatusCode)
	}
}

func contains(haystack, needle string) bool {
	return strings.Contains(haystack, needle)
}
