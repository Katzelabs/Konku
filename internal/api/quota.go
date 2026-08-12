package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// Per-account limits (07 L8).
//
// Not monetisation, and not a nudge towards a paid tier that does not exist.
// An unbounded free write path on a shared VPS is an outage waiting for one
// bad actor, and the pgx pool is capped at 10 connections for the sake of
// every other project on that box (D-028). Pool saturation is the likeliest
// way this application falls over, which is why it is the metric worth
// watching (D-062) — and why the limits below exist at all.
//
// **Generous enough that a real user never meets one.** A limit somebody trips
// while working is a limit that has made the product worse, and this app's
// first constraint is that capture cost stays low (hard rule 7). These numbers
// are far past any plausible personal knowledge base; they are there to stop a
// script, not a person.
//
// Body size is already bounded and is not repeated here: decodeJSON wraps
// every request in an http.MaxBytesReader at maxRequestBody (1 MiB), a note's
// markdown is capped at maxContentLen (256 KiB) and its title at
// maxTitleLen. Those are the "body size" half of this task, and they predate
// it.

// The values live in config so an operator can tune them without a rebuild;
// these are the fallbacks for a Server built with a zero-value config, which
// is only ever a test.
//
// maxNotes and maxCards are counted over live rows, so emptying Terhapus is
// not a prerequisite for writing again. maxWritesPerMinute bounds one
// account's write rate across every endpoint: the note editor autosaves on a
// 1.5s debounce, so someone typing continuously in one tab produces at most
// ~40 a minute, and this is several times that while still nowhere near enough
// to saturate a pool of 10.
const (
	defaultMaxNotes           = 5_000
	defaultMaxCards           = 20_000
	defaultMaxWritesPerMinute = 300
)

func (s *Server) maxNotes() int {
	if s.cfg.MaxNotes > 0 {
		return s.cfg.MaxNotes
	}
	return defaultMaxNotes
}

// writesPerMinute is read at construction because the limiter is built once.
func writesPerMinute(cfg config.Config) int {
	if cfg.MaxWritesPerMinute > 0 {
		return cfg.MaxWritesPerMinute
	}
	return defaultMaxWritesPerMinute
}

func (s *Server) maxCards() int {
	if s.cfg.MaxCards > 0 {
		return s.cfg.MaxCards
	}
	return defaultMaxCards
}

// countForUser runs a count inside a user-scoped transaction.
//
// It has to be scoped, and not merely because of the WHERE clause: notes and
// cards carry the strict RLS policy, so a count on the bare pool with no
// app.user_id set matches no rows at all and comes back zero — which would
// make every quota check pass and the whole feature a no-op that looks like it
// works (D-059). The predicate stays in the SQL regardless; RLS backs it up
// rather than replacing it (hard rule 9).
//
// Deliberately not inside the create transaction, so this is check-then-write
// rather than an atomic reservation. Two requests racing at the boundary can
// both pass and leave an account one row over its cap. At limits this generous
// that is not worth a lock: the quota exists to stop a script from filling a
// shared disk, and being off by one does not change whether it does.
func (s *Server) countForUser(r *http.Request, userID uuid.UUID, count func(*gen.Queries) (int64, error)) (int64, error) {
	var n int64
	err := s.store.WithUserTx(r.Context(), userID, func(q *gen.Queries) error {
		var err error
		n, err = count(q)
		return err
	})
	return n, err
}

// quotaKind labels a rejection, both in the metric and in the copy.
type quotaKind string

const (
	quotaNotes  quotaKind = "notes"
	quotaCards  quotaKind = "cards"
	quotaWrites quotaKind = "write_rate"
)

// rejectQuota answers 429 and counts the rejection.
//
// The message names the limit rather than just refusing. "Terlalu banyak" with
// no number is a dead end: the person cannot tell whether they have hit a bug,
// a bad request, or a rule — and cannot act on any of the three.
func (s *Server) rejectQuota(w http.ResponseWriter, kind quotaKind, message string) {
	s.metrics.quotaRejected(string(kind))
	writeError(w, http.StatusTooManyRequests, CodeRateLimited, message)
}

// withinNoteQuota reports whether another note may be created, answering the
// request itself when it may not.
func (s *Server) withinNoteQuota(w http.ResponseWriter, r *http.Request, userID uuid.UUID) bool {
	n, err := s.countForUser(r, userID, func(q *gen.Queries) (int64, error) {
		return q.CountLiveNotes(r.Context(), userID)
	})
	if err != nil {
		writeInternal(w, r, err)
		return false
	}
	if int(n) >= s.maxNotes() {
		s.rejectQuota(w, quotaNotes, fmt.Sprintf(
			"Kamu sudah punya %s catatan, batas maksimum untuk satu akun. "+
				"Hapus beberapa yang tidak terpakai untuk menulis lagi.",
			thousands(s.maxNotes())))
		return false
	}
	return true
}

// withinCardQuota is the same check for cards.
func (s *Server) withinCardQuota(w http.ResponseWriter, r *http.Request, userID uuid.UUID) bool {
	n, err := s.countForUser(r, userID, func(q *gen.Queries) (int64, error) {
		return q.CountLiveCards(r.Context(), userID)
	})
	if err != nil {
		writeInternal(w, r, err)
		return false
	}
	if int(n) >= s.maxCards() {
		s.rejectQuota(w, quotaCards, fmt.Sprintf(
			"Kamu sudah punya %s kartu, batas maksimum untuk satu akun. "+
				"Hapus beberapa yang tidak terpakai untuk membuat kartu lagi.",
			thousands(s.maxCards())))
		return false
	}
	return true
}

// limitWrites bounds one account's write rate.
//
// Keyed by user id, not by IP: the IP limiters guard the unauthenticated paths
// where there is no account yet, and behind a phone network or an office NAT
// an IP is shared by people who have nothing to do with each other. Reads are
// untouched — they neither grow the database nor hold a write transaction.
//
// Per-process, like every limiter here. Correct for one container and wrong
// the moment there are two, which is a known open question in DECISIONS.md and
// not a problem this deployment has.
func (s *Server) limitWrites(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}

		user, ok := UserFrom(r.Context())
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		if !s.writeLimit.allow(user.ID.String()) {
			s.rejectQuota(w, quotaWrites, fmt.Sprintf(
				"Terlalu banyak perubahan dalam waktu singkat — batasnya %s per menit. "+
					"Tunggu sebentar, lalu coba lagi.", thousands(s.writeLimit.limit)))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// writeLimitWindow is the period the write limit is counted over.
const writeLimitWindow = time.Minute

// thousands formats a number the Indonesian way — 5.000, not 5,000 — because
// the copy it lands in is Indonesian (hard rule 8).
func thousands(n int) string {
	s := strconv.Itoa(n)
	if len(s) <= 3 {
		return s
	}
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(r)
	}
	return b.String()
}
