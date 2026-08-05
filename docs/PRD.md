# PRD — Konku (Personal Learning System)

**Status:** v2 — supersedes the v1 local-first draft
**Last updated:** 2026-08-05
**Companion docs:** `GOALS.md` (personal context — read first), `TECH.md` (architecture), `DECISIONS.md` (what was decided and why)
**Owner:** solo project, single user

---

## 1. What this is

A personal learning system built around one job: **nothing you learn disappears silently.**

You learn something, spend ~15 seconds capturing it, and the system takes over the remembering-to-remember. A focus timer and a light weekly structure sit around that core to keep you showing up.

Self-hosted, server-backed. Web app (PWA), agent-accessible via MCP.

**Multi-tenant, not social.** Each account is an isolated private knowledge base. There is no sharing, no collaboration, no visibility between users — multi-user here means the data model is scoped by owner, nothing more (D-039).

### Core thesis

Learning fails not from lack of information but from lack of **structure** and **retention**. Retention is the part software can fully solve; structure is the part it can only support.

---

## 2. Problems and what the app can honestly do about them

From `GOALS.md`. Sorted by how much software can actually touch them — this ordering drives feature priority.

| # | Problem | Software can solve it? | Mechanism in the app |
|---|---|---|---|
| 5 | Cepat paham tapi cepat lupa | **Fully** | Spaced repetition. This is the product. |
| 4 | Susah fokus lama | **Mostly** | Focus is trainable — measure the curve, raise duration gradually |
| 2 | Gampang hilang motivasi | **If honest** | Evidence of retained knowledge, not effort logs |
| 1 | Kurang disiplin | **Partly** | Remove decisions, lower the cost of starting |
| 3 | Gampang terdistraksi | **Barely** | Timer gives a clear start and end. That is the whole scope. |

**Explicit non-scope:** nothing aimed at problem 3 beyond the timer. No site blockers, no strict modes, no "you left the session" penalties. They don't work on your own device and every one of them is a guilt mechanic, which `GOALS.md` rules out.

### Non-goals

- Teams, sharing, collaboration, social, leaderboards — accounts never see each other's data
- Content delivery — the app does not teach, it schedules and retains
- Heavy gamification: badges, XP, levels, losable streaks
- Real-time collaboration
- Bidirectional file sync with an external editor

---

## 3. User

The primary user is one person: technical (comfortable with code, self-hosts), studies 1–2 hours/day imperfectly, speaks Indonesian. Every product decision is made for them.

The system supports multiple accounts (D-039), but design for the primary user — a second account is an isolated copy of the same experience, never a reason to add sharing, comparison, or social mechanics.

**Language rule:** all user-facing copy in **Bahasa Indonesia**. Code, comments, commits, docs in English.

---

## 4. The central model: notes and cards are one system

This is the most important product decision in the document.

> A **Note** (markdown) is the atom. **Cards** live inside the note's markdown. The scheduler runs over cards. There is no separate "review item" object.

Why it matters:

- **Capture cost collapses.** Adding a card is typing `::` in a note you're already writing — no separate flow, no context switch. Capture cost is the single biggest risk to this product working at all.
- **Cards keep their context.** Fail a review, open the source note, re-read the thing you actually forgot.
- **Agent access becomes trivial.** "Generate flashcards from this note" is just *edit the note's markdown*.

This is where Anki is weak: its cards are divorced from source material, so authoring is a chore, so the deck stays empty. The reference shape here is Obsidian + a spaced-repetition plugin, minus the jank, plus a server and an agent interface.

### Card types

| Type | Syntax in markdown | Grading |
|---|---|---|
| `basic` | `Question :: Answer` | self |
| `cloze` | `text with {{a blank}}` | self |
| `feynman` | `> [!feynman] Explain X` | LLM-graded (M2), self before that |

Every card carries a stable ID embedded in the note as an HTML comment so review history survives edits. See `TECH.md` §4.

---

## 5. Features

### 5.1 Notes (P0)

- Markdown, one note per topic. Title, body, domain tag.
- Editor: plain textarea + preview for M1; CodeMirror 6 later (see `DECISIONS.md` D-018).
- `[[wikilinks]]` between notes, backlinks panel — M3.
- Full-text search (Postgres FTS); semantic search in M2.

### 5.2 Review queue (P0 — the product)

- Cards parsed from notes, scheduled independently.
- Interval ladder: **`[1, 3, 7, 14, 30, 90, 180]` days**.
- On add → `stage = 0`, `nextReviewDate = today + 1`.
- On **ingat** → `stage++`, reschedule by the ladder.
- On **lupa** → `stage = 0`, reschedule to tomorrow, `lapses++`.
- Past the last interval → terminal **`sudah dikuasai`** state, retires from the queue but stays in history. Also markable manually at any stage.
- **Recall before reveal (mandatory).** The review screen shows only the prompt. You attempt recall, *then* reveal, *then* self-rate. Showing the answer immediately turns the whole thing into passive re-reading, which `GOALS.md` says explicitly does not work. This one hidden div is the difference between a retention system and a list of things you once wrote down.
- **Due list is capped** at ~10 cards/day, oldest first, with the rest quietly deferred. Coming back to 40 due items after two weeks away is demotivating regardless of styling.
- Overdue is surfaced calmly — a count, no red, no alarm.

### 5.3 Focus timer (P0)

- Durations 15 / 20 / 25 / 30 / 45 min. **Default 20.** Short durations first in the UI, deliberately.
- Start / pause / reset. Works offline (client-side).
- On completion: log the session (domain, duration, timestamp).
- **Capture is fused into session end.** Timer finishes → "Apa yang kamu pelajari?" → one field, pre-tagged with the session's domain, skippable. Never a separate act of discipline.
- No break timer. Cut — see `DECISIONS.md` D-010.

### 5.4 Progressive focus (P1)

Treats session length as a trainable variable the app manages, not a picker the user operates.

- After N consecutive completed sessions at the current duration, the app quietly offers the next step up as the default. No challenge framing, no celebration.
- Show the duration curve over months. This is the visible evidence for problem 4.

### 5.5 Weekly structure (P1)

- A weekly **quota**, not a day-by-day scoreboard: 3× general, 2× math, 1× psychology, 1× music. Filled in any order, any day.
- The day→domain rota still appears on the home screen as a **suggestion** ("Hari ini: Matematika") to remove the what-should-I-study decision — but it is not scored.
- Rationale: seven checkboxes resetting weekly is seven visible failure slots per week, which contradicts the forgiveness principle. A week at 5/7 reads as "5 done," not "2 missed."

### 5.6 Streak & consistency (P1)

- **Streak counts weeks, not days.** A week counts if the quota is met (or a threshold like ≥4 sessions). A missed Tuesday is invisible; a genuinely dead week breaks it.
- 7-day activity strip for daily texture — informational, not a score, nothing to lose.
- No grace-rule special-casing needed; changing the unit removes the problem instead of patching it.

### 5.7 Retention metric (P1)

The headline number, replacing a stats dashboard:

> "Kamu masih ingat 38 dari 45 topik yang dipelajari 3 bulan lalu."

Computed from `review_logs`: reviews at long intervals (30d+) rated *ingat* vs *lupa*. Effort metrics ("12 jam bulan ini") decay in motivating power; proof of retained knowledge compounds. This is also the only number that maps directly to the success criterion in `GOALS.md`.

### 5.8 AI features (M2)

Ranked by value — build in this order:

1. **Generate cards from a note.** Model proposes 3–5 cards, user accepts / edits / rejects. Attacks capture cost, the biggest risk. Highest value by a wide margin.
2. **Grade a Feynman explanation.** User types their recall from memory; model compares against the source note and reports what was missed; user then self-rates. Self-grading is unreliable — you always feel like you remembered. This makes recall honest and no consumer SRS app does it well.
3. **Semantic search** across notes (pgvector).
4. **Chat over notes** — lowest value, most commonly built. Comes free via MCP; do not build a bespoke one.

### 5.9 MCP server (M2)

Exposes the same operations as the HTTP API so an existing Claude subscription can read and write the knowledge base directly. Built **before** in-app LLM features: zero API cost, zero key management, zero prompt engineering, and immediately useful.

### 5.10 Activity log (P2)

Reverse-chronological log of sessions, reviews, and quota fills. Filterable by domain. Scaffolding — defer.

---

## 6. Domains

| Domain (id) | Display label | Weekly quota |
|---|---|---|
| `general` | Pengetahuan Umum | 3× |
| `math` | Matematika | 2× |
| `psychology` | Psikologi | 1× |
| `music` | Musik | 1× |

Hardcoded for now. Domain/schedule editing is deferred until there is a real fifth domain to add — see open question Q-003 in `DECISIONS.md` about coding as a domain.

---

## 7. UX principles

Constraints, not preferences. Derived from `GOALS.md`.

1. **Low friction to start.** One click from home to a running session. The main failure mode is not starting.
2. **Forgiving, never punitive.** No guilt copy, no shaming empty states, no aggressive red. A missed day is normal; the UI treats it as normal.
3. **Progress must be visible, and honest.** Retention first, effort second.
4. **Calm by default.** Minimal animation, no notification spam. The app competes with short-form content for attention — it should feel like the opposite of that.
5. **Indonesian copy: plain, direct, active voice, sentence case, no filler.**

---

## 8. Milestones

Detailed technical breakdown in `TECH.md` §8.

### MVP — "catat & ingat" (~62 h, ~7–9 weeks at 1–2 h/day)

The retention loop, the focus timer that feeds it, and real auth. Itemized in `backlog.csv` (22 tasks).

**Retention loop (~38 h):** repo + dev compose + migrations · parser (`Q :: A` only) with stable IDs · card sync · scheduler · API (notes CRUD, review due, review rate) · React screens (note list, editor, review) · VPS deploy with off-site backups.

**Focus timer (~11 h):** durations 15–45 min default 20 · start/pause/reset · session logged on completion · **capture-at-session-end** — "Apa yang kamu pelajari?", one skippable field.

**Auth (~13 h):** argon2id hashing, server-side sessions, middleware, login screen, seed-user CLI. `user_id` scoping on every table and every store method from the first migration. **No public signup** — the first account is seeded by CLI, registration sits behind an `ALLOW_SIGNUP` flag that defaults off.

⚠️ **This is nearly double the 35 h MVP scoped in D-031.** Deliberate, and worth re-reading D-030 before starting: the failure mode for this project is spending months building a learning tool and none learning. If it slips past ~10 weeks, cut the timer back out — the retention loop alone is a shippable product.

**What the MVP exists to test:** not whether spaced repetition works — that is known — but *whether you actually write notes and cards*. This is why the timer earns its place: capture-at-session-end is the strongest mechanism in the design for making capture automatic rather than an act of discipline (D-011).

### v0.2

Public signup + password reset (needs SMTP) · cloze and feynman card types · domains and filtering · full-text search · mark-mastered · home screen · Postgres RLS as defense in depth.

### v0.3 — Differentiators

MCP server · LLM card generation · LLM-graded Feynman · semantic search.

### Later — Polish

PWA (installable, offline reads) · retention metric · progressive focus · weekly quota + strip · CodeMirror editor · wikilinks and backlinks · git vault export · activity log.

**The risk this ordering exists to manage:** spending four months building a learning tool and zero months learning anything. If the MVP is not in daily use the week it ships, nothing later fixes that.

---

## 9. Success criteria

From `GOALS.md`, made measurable:

- Sessions run consistently over **weeks**, not one enthusiastic week
- **Retention rate at 30d+ intervals stays high** — the headline metric
- Average session duration trends from ~15 min toward ~45 min without being forced
- Progress is visible as real data, not a feeling
