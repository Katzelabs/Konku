# DECISIONS.md — Decision Log

**Last updated:** 2026-08-20

Why this file exists: `PRD.md` and `TECH.md` say *what* was decided. This says *why*, and what was **rejected**. Without it, every future session re-litigates the same trade-offs and quietly reintroduces the things that were deliberately cut.

Format: decision · rationale · what was rejected.

---

## Product

### D-001 — Retention is the product; everything else is scaffolding
Of the five problems in `GOALS.md`, only "cepat lupa" is fully solvable by software. If the app did spaced repetition well and nothing else, it would still be worth using. If it did everything else and SRS badly, it is just another timer app.
**Rejected:** treating the timer, schedule, and streak as co-equal features.

### D-002 — Nothing is built to fight distraction (problem 3)
The app runs on the same device as the distraction. Blockers and strict modes do not work there, and every "you left the session" penalty is a guilt mechanic that `GOALS.md` explicitly rules out. The timer's clear start/end is the honest limit of what software can do.
**Rejected:** site blockers, strict/hardcore modes, focus-abandonment penalties.

### D-003 — Recall before reveal is mandatory
The review screen shows only the prompt; answer stays hidden until the user attempts recall. Showing it immediately makes the whole feature passive re-reading, which `GOALS.md` says does not work. One hidden div separates a retention system from a list of things you once wrote down.

### D-004 — Retention is the headline metric, not hours studied
"Kamu masih ingat 38 dari 45 topik dari 3 bulan lalu" beats "12 jam bulan ini." Effort metrics decay in motivating power; proof of retained knowledge compounds. It is also the only number matching the stated success criterion. Computable from `review_logs` at 30d+ intervals.
**Rejected:** a stats dashboard as the primary progress surface.

### D-005 — Notes and cards are one system, not two
The Note (markdown) is the atom; cards live inside its markdown; the scheduler runs over cards. There is no separate "review item."
Three separate models (notes / flashcards / review items) means three capture flows and three places for the same knowledge to live half-updated — the standard failure mode for this category. Unifying collapses capture cost, which is the biggest risk to the product working, and makes MCP card-generation a plain note edit.
**Rejected:** Anki-style standalone decks divorced from source material. *(Explicitly confirmed by the user.)*

### D-006 — Weekly quota, not a seven-day checkbox scoreboard
Seven day-slots resetting each Monday is seven visible failure slots per week, contradicting the forgiveness principle. A quota (3 general / 2 math / 1 psych / 1 music, any order, any day) preserves interleaving without creating misses. A week at 5/7 reads as "5 done," not "2 failed."
The day→domain rota **survives as a home-screen suggestion** — deciding what to study is itself a barrier to starting — but it is not scored.
**Rejected:** the v1 PRD's per-day completion checkboxes.

### D-007 — The streak counts weeks, not days
A daily streak is inherently punitive for someone who says up front there will be off days. Counting weeks makes a missed Tuesday invisible while a genuinely dead week still breaks it — forgiving by design rather than by special-case patch, and a simpler `WeeklyStreak()` with fewer subtle bugs.
**Rejected:** both options the v1 PRD posed (a 1-day-per-week grace buffer, and "best streak" shown alongside current). Both patch the wrong unit.
The 7-day strip stays as informational texture with nothing to lose.

### D-008 — Interval ladder extended, plus a terminal mastered state
`[1, 3, 7, 14, 30]` capped at 30 days means a mastered item returns forever, every 30 days. One item a day for a year is ~12 daily reviews, mostly on things known cold — exactly the accumulating obligation that makes people quit.
Now `[1, 3, 7, 14, 30, 90, 180]` plus a `sudah dikuasai` state that retires the card from the queue while keeping its history. Manually markable at any stage.

### D-009 — The due list is capped (~10/day, oldest first)
Returning after two weeks away to 40 due cards is demotivating regardless of styling. `DueCards()` caps and defers the rest quietly. This lives in the pure scheduler, so it had to be settled before writing it.

### D-010 — No break timer
At a 20-minute default it is ceremony, and it inserts a decision at the exact moment the user should feel finished. Revisit if average session length actually reaches 45 min.
**Rejected:** the v1 PRD's optional 5-minute break timer. *(Answers v1 open question.)*

### D-011 — Capture is fused into the end of the session
Timer completes → "Apa yang kamu pelajari?" → one field, pre-tagged with the session's domain, skippable. A separate "add topic" screen is a second act of discipline, and problem 1 says do not rely on discipline. This single flow decision probably matters more to the product working than the entire data model.

### D-012 — Progressive focus is managed by the app
After N consecutive completed sessions at a duration, the next step up quietly becomes the default. Quiet, not a challenge or a celebration. A manual duration picker puts problem 4 back on the user's discipline, which is problem 1.
The v1 PRD's five buttons plus "average session length" buried in P2 stats is a stopwatch, not a training system.

### D-013 — Source references are just part of the note
With notes as the atom, a source link is a line in the markdown. No separate field, no attachment system.
*(Answers v1 open question.)*

### D-014 — Export is the git vault export, plus `pg_dump`
JSON dump superseded. See D-026.
*(Answers v1 open question.)*

### D-015 — Domains hardcoded; the schedule editor is deferred
The four domains are known. Build the editor when there is a real fifth domain to add. See Q-003.

### D-016 — AI features ranked; build in this order
1. **Generate cards from a note** — attacks capture cost, the biggest risk. Highest value by a wide margin.
2. **LLM-graded Feynman** — self-grading is unreliable; you always feel like you remembered. Makes recall honest; no consumer SRS app does it well. This is the differentiating feature.
3. **Semantic search** (pgvector).
4. **Chat over notes** — lowest value, most commonly built. Comes free via MCP.
**Rejected:** building a bespoke chat interface.

### D-017 — MCP before in-app LLM
Zero API cost, zero key management, zero prompt engineering, zero evals, and the user already pays for Claude. Build the HTTP API tool-shaped first; MCP is then a thin adapter and in-app AI later reuses the same tool layer. Also a stronger portfolio signal than "added a chatbot."

---

## Technical

### D-018 — Markdown is the source of truth; the editor edits markdown
Obsidian-shaped, not Notion-shaped. A WYSIWYG block editor storing JSON means every note round-trips through a lossy converter — and with an agent writing notes via MCP, that is a permanent, recurring bug class.
Ladder: **textarea + preview (M1)** → CodeMirror 6 with markdown mode (M3) → inline decoration, `[[wikilink]]` autocomplete, backlinks. CodeMirror 6 is what Obsidian itself uses.
**Rejected:** BlockNote / TipTap-style block editors with JSON storage, and building an editor from scratch. The editor is the single item most likely to eat this project — it starts undersized on purpose.

### D-019 — Cards are written inline in the markdown with stable embedded IDs
Syntax: `Q :: A`, `{{cloze}}`, `> [!feynman]`, each followed by `<!-- c:xxxx -->`.
Matching cards by content means fixing a typo destroys that card's review history. So the parser assigns IDs, writes them back into the note body, and matches by ID only. Vanished IDs soft-delete, never hard-delete. Note update and card sync commit in one transaction.

### D-020 — Server is the source of truth; local-first is abandoned
Postgres, MCP, and multi-device access together make half-supporting a local-first model cost more than it returns. Client caches; server owns state.
**Rejected:** the v1 PRD's localStorage/IndexedDB persistence.

### D-021 — Go + Postgres + React + PWA
Boring, defensible, hireable — and this is also a portfolio project. The non-trivial parts worth showing are the scheduler, the parser, the MCP server, and LLM-graded recall; plain CRUD plus a chatbot is what everyone has.

### D-022 — Markdown in a Postgres `TEXT` column
Transactional with card sync, free FTS via generated `tsvector`, pgvector later with no storage migration. 10,000 notes is tens of MB.
**Rejected:** files-on-disk as source of truth with metadata in Postgres — no cross-store transactions, file-watcher races, and two backup systems that can disagree.

### D-023 — No Redis in v1
Single user: nothing to cache, no queue pressure, sessions live in a cookie. Adding it now is portfolio theater and reviewers read it as such. There *is* a legitimate reason later — a job queue for LLM calls and embedding generation — and adding it then comes with a real answer to "why is this here."

### D-024 — Shared Postgres in prod, isolated Postgres in dev
> **Amended by D-088.** The conclusion holds — shared Postgres, two compose files — but the infrastructure below is not what was built. The network is **`platform`**, not `shared`; the stack is `Katzelabs/platform` with a standalone edge rather than an `infra/docker-compose.yml`; and there is no Mongo on the box.

Konku is one of several projects on the VPS. Shared wins on the things that bite a solo operator: memory is the scarce resource, one backup pipeline, one upgrade path. Isolation buys little with one operator, no untrusted tenants, and no real load.
The main objection — "clone the repo and it doesn't run" — is solved by two compose files: `docker-compose.yml` self-contained for dev and CI, `docker-compose.prod.yml` app-only joining the external `shared` network. The app only ever reads `DATABASE_URL`.
**The decision is cheap to reverse** (`pg_dump` → new service → `pg_restore`, ~10 min), so it was not worth agonizing over. Tripwires in `TECH.md` §10.

### D-025 — `pgvector/pgvector:pg17` from day one, extensions enabled at creation
> **Amended by D-088.** The reasoning holds and is why the platform instance is a pgvector image at all. The version is **pg18** now, in prod, dev and CI — the box was moved to 18 before Konku's first deploy, for the reach to EOL 2030-11-14. `pg_trgm` turns out to be *trusted* in PG13+, so migration `00001` creates it as the owner and only pgvector needs provisioning.

pgvector must exist on the server, not just be `CREATE EXTENSION`-ed. On a shared instance, installing it later means changing the image and restarting Postgres — coordinated downtime across every project by then. The pgvector image is a drop-in superset of the official one. Same reasoning for pinning the major version. `pg_trgm` enabled too, for fuzzy search.
Decided while the infra was still fresh with zero projects on it — deliberately.

### D-026 — Git vault export, strictly one-way
A background job writes the vault to `/var/lib/konku/vault/*.md` and commits. Gives free per-note version history, an Obsidian-readable folder, and zero lock-in — and a second line of defense if a Postgres restore goes wrong.
Writes only ever go through the API. Allowing edits both on disk and in the app creates bidirectional sync with conflict resolution: a multi-week project that has sunk better-resourced apps.

### D-027 — MongoDB is not used by konku
Note → cards → schedules → logs is relational, and card sync must commit transactionally with the note. FTS and vectors both live in Postgres. Splitting one app across two stores buys two backup paths and two failure modes for nothing. Markdown being "document-shaped" is not a reason; it is a text column.

### D-028 — Connection pool capped per app
`max_connections` defaults to 100; Go's `database/sql` defaults to unlimited. One app can starve every project on the box. `SetMaxOpenConns(10)` on a shared instance, in every project.

### D-029 — `review_logs` from day one
Retention — the headline metric — cannot be reconstructed retroactively. This is the table people forget and then cannot add later.

### D-030 — M1 ships with no AI, no MCP, no PWA, no stats
The failure mode for this project is spending four months building a learning tool and zero months learning. M1 is a thin vertical slice in daily use; if it is not being used at the end of M1, no amount of M2 fixes that.

### D-031 — MVP is the retention loop only; the focus timer is cut
The original M1 was ~90 h of work, which at 1–2 h/day is 8–9 weeks — too big to be an MVP.
The MVP's job is to test the **riskiest assumption**, and that is not "does spaced repetition work" (known) but "will the user actually write notes and cards." So the MVP is the smallest thing that exercises capture → review, ~35 h.
**Cut to v0.2:** focus timer and session logging (~8 h — a phone timer covers it this month; you cannot phone-timer your way out of forgetting), real auth (replaced by Caddy `basic_auth`), cloze and feynman card types (MVP parses `::` only — one syntax, one rule, small test surface), domains, full-text search, mark-mastered, home screen.
**Kept despite the cutting:** stable card IDs (D-019), recall-before-reveal (D-003), `review_logs` (D-029), off-site backups. Each is cheap now and either impossible or painful to retrofit — the first two silently corrupt data, the last two lose it.

### D-032 — `go.mod` at repo root, React in `web/` *(resolves Q-002)*
Not `server/` + `client/`. Go projects with React frontends overwhelmingly put the module at the root and the frontend in a subdirectory — Prometheus (`web/ui`), Grafana (`public/app`), Gitea (`web_src`), Traefik (`webui`). Asymmetric on purpose: Go *is* the project; the frontend is an asset it serves.

```
konku/
├── go.mod  sqlc.yaml  Makefile  Dockerfile  Caddyfile
├── docker-compose.yml  docker-compose.prod.yml
├── migrations/             # goose, embedded, runs at startup
├── cmd/konku/              # main.go + seed_user.go
├── internal/
│   ├── card/               # PURE — parse, stable IDs, render
│   ├── srs/                # PURE — intervals, scheduling
│   ├── auth/               # argon2id, sessions, middleware
│   ├── store/              # queries/ · gen/ · the card-sync transaction
│   ├── api/                # chi routes, handlers, one error shape
│   ├── config/
│   └── web/
│       ├── embed.go        # //go:embed all:dist
│       └── dist/           # Vite writes straight here
└── web/                    # the React app
```

**Two concrete reasons over `server/` + `client/`:**
1. **Go tooling assumes `go.mod` at root.** Nested, every command becomes `go -C server ...` — Makefile, CI, LSP, and `go install <path>@latest` all get slightly worse, permanently.
2. **The `go:embed` copy step disappears.** Embed cannot reach outside its module, so a nested module would force copying `client/dist` → `server/internal/web/dist` on every build. With the module at root, Vite writes directly into the embedding package via `build.outDir: '../internal/web/dist'`. A whole class of stale-build bugs never exists.

**The enforceable rule: `card` and `srs` import nothing from `internal/`.** If either ever needs `store`, the design went wrong. Greppable in CI.

Commit `internal/web/dist/.gitkeep` — `//go:embed all:dist` is a *compile-time* error on a missing directory, so a fresh clone would otherwise fail `go build`.

**Rejected:** `server/` + `client/` (right for genuinely separate deployables, multiple backends, or a team split by language — none apply). Separate modules for the MCP server — version-bumping your own dependency to change an API. `pkg/` over `internal/` — this is an application; tests demonstrate quality, not import paths. Two repos.

### D-033 — `internal/card` owns both parse and render *(resolves Q-001)*
`Parse(md) []Card` and `Insert(md, card) md` both live in `card`. The write direction is already needed for stable-ID write-back, so this is nearly free.
It also makes the deferred MCP question trivial when v0.3 arrives: `add_card()` becomes a thin wrapper over `card.Insert`, and an agent writing raw markdown goes through `card.Parse`. Both paths hit the same code and cannot drift — the chokepoint is guaranteed without deciding the tool shape now.

### D-034 — Coding is a fifth domain with quota 0 *(resolves Q-003)*
Go, Postgres and CodeMirror cards will accumulate while building this and need somewhere to live. But coding does not belong in the weekly rota — it is already the day job and would compete with the four domains actually being grown.
Quota 0 means: valid tag, no scheduled sessions, does not count toward the week. No special-casing needed; the quota field already exists.

### D-035 — A week is complete at ≥4 sessions *(resolves Q-004)*
Not the full quota of 7. Requiring a perfect week makes the weekly streak nearly as brittle as the daily streak that was cut in D-007, defeating the point. Four is "showed up more days than not" — the honest bar for *konsistensi kecil*.

### D-036 — Feynman grading informs, never rates *(resolves Q-005 in principle)*
The model reports what the recall missed; the user still presses ingat or lupa. An LLM overriding self-assessment is a judgment mechanic, and this app does not have those.
**Still open:** the output format (missed points? a score? a rewrite?). That needs the feature in front of you — decide during v0.3.

### D-037 — Progressive focus suggests, never challenges *(resolves Q-006 in principle)*
The next duration up becomes the pre-selected default; changing it back is one tap and unremarked. No celebration, no "level up," no streak attached to it.
Default N = 5 consecutive completions, tunable once there is real data.

### D-038 — The focus timer is back in the MVP, with capture-at-session-end
Partially reverses D-031. The timer alone would still be cut — it costs ~11 h and does nothing for the MVP's actual question. What earns its place is **capture-at-session-end** (D-011): timer completes → "Apa yang kamu pelajari?" → one skippable field, pre-tagged with the session domain.
The MVP exists to test whether notes and cards actually get written. This is the strongest mechanism in the whole design for making that automatic rather than an act of discipline — so including the timer *serves* the MVP's purpose rather than diluting it. A timer without the capture prompt would not have been worth adding.
MVP grows from ~35 h to ~46 h.

### D-039 — Multi-user data model from day one; single-user operation in the MVP
Supersedes the single-user assumption throughout the v1 PRD.

**Multi-tenant, not social.** Each account is an isolated private knowledge base — no sharing, no collaboration, no visibility between accounts. Every never-punitive and no-social constraint from `GOALS.md` stands unchanged; the primary user is still the only one the product is designed for.

**Why the split.** "Multi-user" decomposes into a data model (expensive to retrofit) and a signup flow (cheap to add anytime). Doing all of it in the MVP costs ~22 h and pushes the MVP back to 8–9 weeks — the size that was just deliberately halved. Doing the data model plus real auth costs ~8 h and leaves nothing painful behind.

**In the MVP:** `user_id` denormalized onto every owned table from the first migration; every store method takes a `userID`; ownership enforced in the `WHERE` clause, never fetch-then-check, so a wrong owner returns "not found" and cannot probe for another user's data; argon2id hashing; server-side revocable sessions; login rate limiting; first account seeded by CLI.

**Deferred to v0.2:** public signup, password reset (needs SMTP), Postgres RLS as defense in depth.

**Rejected:** signed-cookie sessions (not revocable), and fetch-then-check ownership (leaks existence).

### D-040 — One binary, one origin: Go serves both the API and the React build
React is a pure API consumer; Go never renders HTML. The built SPA is embedded via `go:embed` and served from the same origin as `/api/*`, with an `index.html` fallback for client-side routes.

**Why not a separately-deployed SPA** (React on Vercel/Netlify, API on its own domain) — the common default, and worse here for concrete reasons:
- **Cookie auth just works** at same origin. Split origins mean CORS with credentials, preflight on every mutation, `SameSite=None`, and Safari-specific breakage — all self-inflicted given D-039 chose cookie sessions.
- **Service worker scope.** The PWA caches shell and API responses together; one origin makes that trivial.
- **One artifact**, so frontend and backend can never be version-skewed, and one Caddy route instead of two.

Cost: a frontend change requires a Go rebuild. A Makefile concern, not an architectural one.

Dev uses a Vite proxy (`/api` → :8080) specifically to preserve same-origin behaviour in development, so cookies behave identically in both environments.

**Corollary:** browser sessions and machine Bearer tokens resolve through one middleware to a `userID`. Handlers never know which credential was used, so MCP in v0.3 adds a resolver rather than an API surface.

### D-041 — Node is a build-time dependency only; nothing Node runs in production
`client/` has a `package.json` and the full Vite toolchain, but no Node process exists in production. Vite emits static files; Go embeds and serves them (D-040). The Dockerfile is multi-stage — Node stage builds the client, Go stage builds the binary, final image carries neither toolchain.

**Rejected: running a Node server in production** (Next.js, or Express serving React). It would add a second container and runtime to the VPS, a second dependency tree to patch, and either a second origin or a proxy hop faking one — undoing D-040 and reintroducing the CORS and service-worker-scope problems it avoids.

What that would buy is SSR, which is worth nothing here: the app is entirely behind a login, has no SEO surface, and no first-paint requirement a static shell cannot meet. Next.js for an authed personal SPA is pure overhead.

### D-042 — chi for routing; no Go "framework"
There is no Rails or Django in Go. Gin, Echo and Fiber are routers plus middleware helpers — they give no scaffolding, ORM, migrations or codegen, so the usual reason to accept framework lock-in does not exist.

**chi** is a thin router whose handlers *are* `http.HandlerFunc` and whose middleware *is* `func(http.Handler) http.Handler`. Zero lock-in, removable in an afternoon.

**Chosen over stdlib** (which since Go 1.22 has `GET /api/notes/{id}` patterns and would work) for route groups with per-group middleware. The auth surface is mixed — everything under `/api` requires a user *except* login — and getting that wrong is a security bug, not a style issue. chi makes it structurally hard to get wrong.

**Rejected — Gin/Echo:** they replace `http.HandlerFunc` with a custom `Context`, so handlers stop being standard `http.Handler`s. `httptest` gets awkward and the `net/http` middleware ecosystem (otelhttp, rate limiters) no longer plugs in without adapters.

**Rejected — Fiber:** built on `fasthttp`, not `net/http`. It would work here — Fiber has native equivalents for SPA serving, rate limiting, sessions and testing, and its lack of HTTP/2 is neutralised by Caddy terminating in front. The objection is narrower: it buys Express ergonomics and throughput measured in tens of thousands of req/s for an app serving one user, in exchange for ecosystem lock-in and handlers that must be rewritten to migrate. It also works against the stated goal of deepening Go — `net/http` idioms transfer everywhere, `fiber.Ctx` transfers to Fiber.

### D-043 — `pgx` + `sqlc`; no ORM
Write SQL, generate type-safe Go. Full control of every query matters more than usual here because D-039 puts `WHERE user_id = $n` on every single one — that is exactly the predicate an ORM's convenience layer tends to hide or forget.

**Rejected:** GORM and ent — magic, vague errors, and generated SQL you have to reverse-engineer when a query is slow.

### D-044 — TanStack Query for server state; Zustand only for the timer
Supersedes the v1 PRD's "local component state + a small store (Zustand or Context)".

Most of what looks like state in this app is **server cache**: notes, due cards, sessions. TanStack Query gives caching, refetch, loading/error states and optimistic updates for free — and "rate a card, have the due list update correctly" is a solved problem there. Hand-rolling it in Zustand is the standard route to stale-data bugs.

Genuine client state is essentially just the timer: running or not, seconds remaining, selected duration. That is `useState` or a small Zustand store.

**Also rejected:** barrel files (`index.ts` re-exports) — circular imports and worse tree-shaking. Type-based top-level folders (`components/`, `hooks/`, `utils/`) — feature folders instead, so a change to review touches one directory.

### D-045 — Dependencies stay countable
Backend, total non-stdlib: **chi, pgx, goose, `x/crypto`** (argon2). Logging is stdlib `log/slog`; config is `os.Getenv`; validation is hand-written; DI is a struct with fields and a constructor.

Each rejected library — Viper, zap/logrus, Wire/Fx, struct-tag validators — delivers value at a scale this project will never reach, while costing magic and indirection from day one. A dependency list defensible line by line is itself a portfolio signal.

---

## Schema v2 — per-user domains and exams

Migration `00002_domains_and_exams.sql`. These six supersede parts of the original data model in `TECH.md` §3.

### D-046 — Domains are per-user *(supersedes D-015, D-034)*
D-015 hardcoded five global domains because they were known and there was one user. D-039 then made the data model multi-tenant, which leaves global domains as the one shared mutable thing in an otherwise isolated knowledge base: user B renaming "Matematika" renames it for user A. Domains now belong to a user, who can create, rename, recolor, reorder, set quota, and archive them.

**Shape:** surrogate `uuid` PK plus `UNIQUE (user_id, slug)` — *not* a composite `(user_id, slug)` primary key. A composite PK propagates a two-column natural key into `notes`, `focus_sessions` and `exams`, forcing every one of them to carry the slug. The uuid keeps each reference one column wide; the slug survives for seeding and URLs. D-034's quota-0 convention is unchanged and still how coding stays out of the rota.

The five seeded domains move out of the migration and into `seed-user`, since rows can no longer exist without an owner.

**Consequence:** a domains UI stops being deferrable. Per-user domains the user cannot edit are strictly worse than global ones.

**Rejected:** a global catalogue plus a `user_domains` settings join table. It keeps existing FKs untouched but a user can never add a domain that was not shipped, and one label serves everyone — which is the problem, not the workaround.

### D-047 — Cross-tenant references are blocked by composite foreign keys
Hard rule 4 puts `user_id` in the `WHERE` clause of every read. It does nothing for *writes*: with per-user domains, `notes.domain_id -> domains.id` lets an unvalidated `domainId` in a request body attach one user's note to another user's domain. The FK is satisfied, no `WHERE` clause is involved, and the leak is invisible until someone reads the join.

So every owned reference carries the owner and points at a `UNIQUE (user_id, id)`:

```sql
FOREIGN KEY (user_id, domain_id) REFERENCES domains (user_id, id)
```

`user_id` is already denormalized onto every table (D-039), so the columns exist and the cost is one redundant unique index per parent. `MATCH SIMPLE` — the default — is what keeps optional references working: a NULL `domain_id` satisfies the constraint whatever `user_id` says.

Handler-side validation stays, but demoted: it exists to return a 400 with Indonesian copy instead of a 500 on a constraint violation. The database is the guarantee.

**Exception, deliberate:** history tables (`review_logs`, `exam_attempt_cards`) have no FK to `cards`. See D-050.

**Rejected:** validating ownership in the handler alone — that is fetch-then-check wearing a different hat, and D-039 already rejected it.

### D-048 — Exams are in-app practice tests over existing cards
An exam draws from the cards that already exist in notes. It is not a question bank — a second place for knowledge to live is exactly what D-005 collapsed.

Two selection modes. `fixed` pins a card set in `exam_cards`, so scores are comparable across attempts. `random` draws `question_count` cards from the domain at attempt time — better practice, non-comparable scores. A CHECK ties `question_count` to exactly the mode that uses it.

`domain_id` is nullable: an exam with no domain draws from the whole knowledge base.

**Not decided here, on purpose:** whether a random draw includes mastered cards. Currently all live cards, on the grounds that an exam is not a review session. Revisit with real attempts in front of you.

**Rejected:** a separate question bank divorced from notes (D-005), and exams counting toward the weekly rota or streak (D-035 counts focus sessions — sitting a mock test is not a study session).

### D-049 — An exam answer is a review that does not move the schedule
Exam answers are written into `review_logs` with `source = 'exam'` and an `exam_attempt_id`. There is no `exam_answers` table.

**Why one table:** D-029 makes `review_logs` *the* retention record, unreconstructable after the fact. A second answer table would make every retention query a `UNION` forever. A `source` column instead gives the metric a lens — default to `'review'`, include exams when you want them.

**Why the schedule stays put:** advancing the ladder on cards that were not due scrambles the capped oldest-first due list (D-009), and a `lupa` in a mock test resetting a month of real progress is a punishment mechanic (rule 6). For `source = 'exam'`, `interval_before` and `interval_after` are written equal — the schedule did not move.

Reversible: making exams advance the schedule is handler logic, not a migration.

**One answer per question per attempt**, enforced by a partial unique index on `(exam_attempt_id, note_id, card_id)` in `00003`, and the insert is `ON CONFLICT DO NOTHING`. Partial because ordinary reviews are *supposed* to repeat — the same card is rated again every time it comes due. Without it a double-clicked rating writes two rows, and since `FinishAttempt` counts rows the score reads 11/10 and the retention metric double-counts that card.

**Rejected:** an `exam_answers` table, and grading exams into the SRS ladder.

### D-050 — Attempts are resumable; the draw is snapshotted
`exam_attempt_cards` records the question set in presentation order when an attempt starts. Without it a `random` draw exists only in memory, so closing the tab halfway loses every unanswered question, and an edit to `exam_cards` between attempts silently changes what two `fixed` scores are comparing. Remaining questions are the snapshot `LEFT JOIN review_logs` where no log row exists.

`exam_attempt_cards` has **no foreign key to `cards`**, matching `review_logs`. This is history: a hard-deleted note must not take a finished attempt's question list with it. That trades FK-enforced tenancy (D-047) for durability on this one table — the composite FK to `exam_attempts` still pins the owner, and rows are only ever inserted from a user-scoped `SELECT`.

**Rejected:** one-sitting-only attempts. An interruption costing you the run is friction with no upside, and fixed exams would still drift between attempts.

### D-051 — Domains and exams archive; deletion is only for unreferenced rows
Both carry `archived_at`, and every reference to them is `ON DELETE NO ACTION` — explicit, not a leftover default. A domain with notes or sessions cannot be deleted, only hidden from pickers; a domain created by mistake with nothing attached still deletes cleanly. Same for exams: deleting one with attempts would destroy the score history while the individual answers survive in `review_logs`, which is the worst of both.

Same reasoning as card soft-delete (D-019) — history outlives the thing it points at — and it matters more for `focus_sessions`, where the domain *is* the record.

Handlers map `foreign_key_violation` to a 409 with Indonesian copy, never a 500.

### D-052 — `sessions` is renamed to `auth_sessions`
Server-side auth sessions and focus sessions both wanted the name. With exam attempts arriving as a third timed thing, "which sessions table" stops being a joke. One migration line, permanent clarity.

### D-053 — Tokens in CSS, components owned; shadcn is a source, not a dependency
Tailwind **v4**, with every design token declared in `web/src/styles/theme.css` (`@theme`, plus `:root`/`.dark` semantic layers). No `tailwind.config.js` — reintroducing one splits the source of truth for "what colour is that". The upgrade from v3 was done before the token layer existed, when it cost eight renamed utilities; after, it would have meant rewriting the tokens.

Component primitives live in `web/src/components/ui/` and are **ours**. shadcn/ui supplied the starting source for the ones worth not hand-writing; the files were then restyled against the tokens. Radix is pulled in only where behaviour is genuinely hard and invisible when wrong: `Dialog` (focus trap, focus restore, scroll lock, Escape, `aria-modal`) and `Switch`. The modal it replaced had none of those. Everything else — Button, Input, Card, Badge, Separator, Label — is markup, because with a mockup in hand writing them is faster than bending someone else's variants.

The deciding fact was that the Figma mockup's palette *is* Tailwind's defaults — `indigo-600`, `gray-*`, `rounded-xl`, hairline borders. That is shadcn's own look, so adopting it removed work instead of creating override layers. Had the mockup carried a bespoke identity, the call would have gone the other way.

Runtime cost: seven frontend packages (three Radix, `clsx`, `tailwind-merge`, `cva`, `lucide-react`) plus self-hosted Geist. All build-time in the D-041 sense — Vite emits, Go embeds, no Node in production.

`/design` renders every token and variant, gated behind `import.meta.env.DEV` so Rollup drops it from the embedded build. A living style guide is the only thing that reliably stops the same button being reinvented in five feature folders.

**Rejected:** MUI/Mantine/Chakra — a competing styling engine and a house style to override. `tailwind.config.js` on v3 — tokens in JS. Installing shadcn's full catalogue. Hand-rolling the dialog, again.

### D-054 — The Figma mockup is a visual reference; its mechanics are not adopted
The mockup (six 1440px frames: home, notes, cards, exams, timer, settings) is where the palette, the Geist typeface, the 260px sidebar, the two-pane notes layout, the floating focus pill and the card geometry come from. **Its product model is not this product**, and the differences are not gaps to fill later — most are things this file already rejected.

Rejected, with the decision each one contradicts:

- **`Study Streak — 18 Days` / "Personal record is 21 days!"** — D-007. A daily streak is punitive for someone who said up front there will be off days. The weekly streak (D-035) stands.
- **`Cards Reviewed 142 / 200`, `80% of daily target reached`** — D-009. The due-card cap exists so that two weeks away is ten cards, not forty. A daily target inverts the one mechanic protecting against quitting.
- **"You are on track to complete all of your goals today"** — on-track framing manufactures off-track guilt.
- **Four-way grading with a red `Hard` button** — the scheduler is binary (`lupa`/`ingat`), and colouring "forgot" as an error contradicts the entire premise of spaced repetition. No red on a review outcome, ever.
- **`Score: 92% accuracy`, `Grade: B+`, `Action Required`, readiness bars in red/green** — gamification and pass/fail framing.
- **`Cards` as a top-level page with decks, cover art and import** — cards are embedded in notes (`Q :: A`) and addressed by note + ID. There are no decks and no card CRUD outside the note.
- **Timer duration picker (`25m / 45m / 50m / Custom`) and break lengths** — D-014. A manual picker puts problem 4 back on the user's discipline, which is problem 1. Progressive focus raises the default quietly, starting at 15–20 minutes.
- **`Share` on a note** — D-039, multi-tenant but never social.
- **`Pro Member`, avatar upload, push notifications, CSV export** — not in scope.

The mockup also has **no review screen**, which is the product's core loop, and **no domains UI**, which D-046 made mandatory. Its `Settings` page offers a daily review target — the one setting that must not exist.

Recorded here rather than fixed silently because a mockup outlives a conversation: without this entry, the next person to open the Figma file reintroduces the streak.

**Consequence:** the palette has no `success` or `warning` token and no green or amber, and `destructive` is documented as delete-only. Painting a punitive screen requires leaving the design system, which is the point. See `docs/DESIGN.md` §5.

---

## Cards leave the note

### D-055 — Notes and cards are two features, not one *(supersedes D-005; retires D-019; overturns D-054's card clause)*

Cards are their own resource with their own table, their own uuid, and their own CRUD screens. A note is markdown and nothing else. The two relate through shared categories and a shared domain vocabulary, not through containment.

**This reverses D-005, which was recorded as "explicitly confirmed by the user".** It was reversed the same way — proposed, argued against, and confirmed again. Recording that here because a reversal without its reasoning reads like drift, and the next person to find D-005 needs to know it was retired on purpose rather than forgotten.

**The argument against, which was made and overruled:** three models mean three capture flows and three places for knowledge to live half-updated, which is the standard failure mode for this category. D-005 collapsed them precisely to protect capture cost (hard rule 7).

**The argument for, which won:** the two have genuinely different use cases. A note is a place to think; a card is a memorisation instrument. Requiring a note before a card taxes the card — the thing the product's core loop actually runs on (D-001) — to protect a coupling that only ever existed to save a capture flow. A card-first screen is now the shortest path to a card there has ever been, so capture cost went *down* for the artefact that matters most.

**What was given up, honestly:**

- The `Q :: A` syntax, the parser, `internal/card`, and its TypeScript mirror. About 900 lines deleted.
- "Fix the card by fixing the note" — a card no longer has a source note to return to. The review screen now links to the card itself.
- The git vault export (D-026, v0.2) gets a second thing to export. Notes are still markdown files; cards will need their own representation.

**What survives, restated rather than dropped:**

- **Editing a card must never reset its schedule.** That was hard rule 2's entire purpose and the most damaging silent bug this codebase had available. Stable IDs are gone, but the property is now structural: the uuid is the primary key and an edit is an `UPDATE`, so there is no content matching left to get wrong. Guarded by `TestScheduleSurvivesCardEdit`, which was kept and rewritten rather than deleted with the parser.
- **Soft delete**, for a new reason: a finished exam attempt renders its questions by joining `cards`, so a hard delete would blank out past results. It also makes deletion undoable.
- **Recall before reveal (D-003)**, held one level lower than before. The card *list* withholds `back` too, not just the review screen — an index visited daily that ships every answer would leave the mechanism one dev-tools glance from defeat.

**Consequences worth knowing:**

- `cards.domain_id` had to exist before `note_id` could go. Cards inherited their domain by joining notes, so every exam draw and the card filter would otherwise have silently returned nothing rather than erroring.
- Migration `00004` is destructive and was only free because the app had not shipped. `review_logs` cannot be reconstructed (D-029); this was the last moment that was true without cost.
- **Cloze and feynman stay deferred (D-031).** Standalone card CRUD makes a type picker trivial to add, which is exactly why it is worth saying no here explicitly.

---

### D-056 — Deleting a note is soft, and "recoverable" means a screen, not a toast

Notes get `deleted_at` (migration `00005`) and the same delete/restore pair cards have carried since `00001`. Both lists take `?deleted=true` for a **Terhapus** view, and both screens let you tick several rows and act on the selection at once.

**Why notes were not deletable at all until now:** they simply had no endpoint. `notes.sql` carried a `DeleteNote` hard delete that nothing ever called — one `DELETE FROM notes`, one route away from being wired up.

**Why not just wire that up.** Nothing references a note but its own labels, so a hard delete is referentially safe, and that is exactly the trap: it is safe for the *database* and unsafe for the *person*. Shipping it would have put a button in the UI that destroys writing permanently on one click, in an app whose stated thesis is that nothing you learn disappears silently. The card precedent already existed; only its justification differed, and a justification is not a reason to reach a different answer.

**Why a Terhapus view rather than an undo toast alone.** A toast makes recovery a reflex test — miss it, navigate away, and a reversible action has become an irreversible one with extra steps. The undo notice is still there, because it is the fast path, but it is a shortcut *to* the bin, never the only route back. This is also why the selection is not stored in the URL the way `?view=` and `?q=` are: a filter is worth reloading into, a half-made selection of things you were about to delete is not.

**One statement for one and for many.** `SoftDeleteNotes` / `SoftDeleteCards` take a uuid array, and the single-item endpoints pass an array of one. Deleting one is deleting a selection of one, so there is no second code path to keep in step — the alternative is two statements that drift, and the one that drifts is the bulk one nobody tests.

**Bulk answers a count, not 204.** An id that was already deleted, or that names nothing this user owns, does not match, so the rows changed can be fewer than the ids sent. That is not an error — "delete these twelve" is satisfied when one had already gone — but the screen reports the number, so it reports the true one. Tenancy is unchanged: `user_id` is in the `WHERE` clause, so another user's id is silently not counted rather than refused (D-039).

**Consequences worth knowing:**

- `GetNote` and `UpdateNote` both gained `deleted_at IS NULL`. Without it on `UpdateNote`, the note editor's save-on-unmount would **resurrect a note the user had just deleted** — the row would reappear in the list with nobody having restored it. The editor also suppresses that save after a delete, but the SQL is what makes it impossible rather than merely unlikely.
- Category counts now exclude soft-deleted notes and cards. The join rows survive a delete so a restore brings the labels back with the item; counting them would read "12 catatan" beside a list of four.
- A category attached only to deleted notes still cannot be hard-deleted — the join row is a real reference. Archiving remains the normal path (D-051), so no new policy was added for it.

---

## Production

Konku stops being a personal instance. The entries below reverse deferrals that
were correct while there was one user and one operator, and are wrong the
moment a stranger's data is on the box. Each names what it supersedes — none of
the earlier reasoning was mistaken at the time, and the ones that still hold
(dependency discipline, no framework, no Redis) are amended rather than
discarded.

### D-057 — Konku is a product; the personal-project framing is retired *(amends D-021, D-030, D-031; supersedes PRD §3's "solo project, single user")*

The app is built and operated to the same standard as any production service:
CI as a merge gate, observability, security hardening, tested restores, public
accounts. "It's just for me" stops being an argument that closes a discussion.

**What does not change.** Every constraint in `GOALS.md` — never punitive, no
gamification, no social, no losable streaks, capture cost above all — was
recorded as a personal preference and is hereby promoted to a **product
constraint**. They were never justified by the audience being one person; they
were justified by what actually makes people keep learning. Rule 6 and rule 7
outrank growth metrics, and there are no growth metrics.

**What the earlier framing got right, kept.** D-030 and D-031 exist to manage
one failure mode: spending months building a learning tool and none learning.
That risk is real and does not go away because the ambition grew. It is now
managed by ordering rather than by cutting — the personal instance ships and
enters daily use **before** the hardening work starts, and public signup opens
after both. Hardening an app nobody uses is the same mistake wearing a
production badge.

**What is explicitly still out.** Teams, sharing, collaboration, leaderboards,
public profiles, billing, ads, referral mechanics, engagement notifications.
"Production" means the engineering and operational bar, not a growth surface.
Multi-tenant, never social (D-039) is unchanged.

**Rejected:** rewriting the product to be broadly appealing. The design is for
one specific person and people who learn like them; widening the audience by
softening the opinions produces the mediocre SRS app the market already has.

### D-058 — Public accounts ship complete: signup, email verification, reset, and deletion *(supersedes D-039's deferral)*

D-039 deferred signup and password reset to v0.2 on the grounds that a signup
flow is cheap to add anytime. That is still true, and it is now due. All four
land together because three of them alone is a trap.

- **Signup** behind `ALLOW_SIGNUP`, which stays a flag and becomes `true` only
  on the public instance. A private deployment keeps the seeded-account model.
- **Email verification is required before the account is usable.** Not
  politeness — the reset link is the only account-recovery path there is, so an
  unverified address is an account that can never be recovered, and an
  unverified signup form is a free spam relay pointed at whatever address an
  attacker types.
- **Password reset** with single-use, expiring (1 h), constant-time-compared
  tokens stored hashed. The response is identical for a known and an unknown
  address — the same existence-leak reasoning as D-039's not-found rule.
- **Account deletion** that actually deletes, self-service, with the export
  offered first (D-066).

Every one of these is an unauthenticated write path, so every one of them is
rate-limited — by IP *and* by target address, because per-IP alone lets an
attacker mailbomb one victim from many hosts.

**Rejected:** OAuth/social login (a third-party dependency in the auth path and
an account-recovery story you do not own, for a login screen used once a
month). Magic links as the only login method (an email round trip on every
sign-in is friction, and rule 7 is about friction). Unverified accounts with a
"verify later" nag.

### D-059 — Postgres RLS becomes a launch requirement *(supersedes D-039's deferral)*

D-039 called RLS "defense in depth, worth doing, not worth blocking the MVP
on." Correct then: the only data a scoping bug could leak was the operator's
own. With strangers' notes in the same tables, one forgotten `WHERE user_id`
stops being a bug and becomes a breach that must be disclosed. Defense in depth
is exactly what you want backing a rule enforced by 60-odd hand-written
queries.

**Shape.** `user_id` is already denormalized onto every owned table (D-039)
precisely so this would be a drop-in. Policy per table on
`user_id = current_setting('app.user_id')::uuid`, with the setting applied by
`SET LOCAL` inside the transaction that runs the query.

**The cost, stated honestly.** `SET LOCAL` is transaction-scoped, which means
every user-scoped read has to run inside a transaction — today most of them do
not. That is a real store-layer change (`WithUserTx`), not a migration you
apply and forget. It is worth it because the alternative is trusting that
nobody ever writes one query wrong, forever.

**Two details that make the difference between RLS and the appearance of it:**

- **`ALTER TABLE ... FORCE ROW LEVEL SECURITY`.** A table owner bypasses its
  own policies by default, and the app currently connects as `konku`, which
  owns the database. Without `FORCE`, every policy is inert and every test of
  them passes.
- **Prefer a non-owner application role** (`konku_app`, `GRANT`-ed only what it
  needs) so migrations and the running app are not the same principal.

**Rejected:** RLS *instead of* the `WHERE` clause. The application predicate
stays primary; two independent mechanisms is the entire point, and a single
mechanism configured in the database is not obviously safer than a single
mechanism written in Go.

### D-060 — Browser hardening: same-site cookies and origin checks, not a CSRF token

State-changing requests are same-origin (D-040) JSON. Given
`SameSite=Lax; Secure; HttpOnly`, a cross-site form POST does not carry the
session cookie, and a cross-site `fetch` with `Content-Type: application/json`
is preflighted and refused. So the control is:

- `SameSite=Lax` (not `Strict` — `Strict` breaks arriving from an email link,
  which D-058 makes a normal path), `Secure`, `HttpOnly`
- Reject state-changing requests whose `Origin` is present and not our own, and
  whose `Content-Type` is not `application/json`
- **Session ID rotates on login**, so a fixated session cannot survive
  authentication
- A **sessions screen**: list active sessions, revoke one or all. Server-side
  sessions (D-039) already make this a query rather than a feature.

Plus the middleware that should have existed anyway: a security-header set
(`Content-Security-Policy` with no `unsafe-inline`, `frame-ancestors 'none'`,
`X-Content-Type-Options`, `Referrer-Policy`, HSTS from Caddy) and
`http.MaxBytesReader` on every request body — an unbounded note body is a
memory-exhaustion primitive once anyone can sign up.

**Rejected:** a synchroniser-token CSRF layer. It defends against an attack the
cookie policy already blocks, and it costs a token endpoint, a client-side
cache, and a class of confusing 403s. **Revisit if** the API ever accepts
form-encoded bodies or the frontend ever moves to a second origin — either one
makes the token necessary and this entry wrong.

### D-061 — CI is a merge gate, and deploys come from tags

There is no `.github/` in this repository. Every rule this project has —
`internal/srs` imports nothing, sqlc must not drift, the frontend must
typecheck — is enforced by remembering to run `make check`. Rules that are not
enforced decay, and that was already the argument in the CI task (written as
`04-ship.md` S1, moved to `06` P0 by D-067) before
production was on the table.

- **On every PR:** `go vet`, `go test ./...` against a Postgres service
  container, `make check-pure`, sqlc drift check, `npm ci && npm run typecheck
  && npm run build`, frontend tests, e2e (D-063), `govulncheck`, and a Docker
  image build so a broken Dockerfile is caught before deploy day.
- **Branch protection on `main`:** green CI required, no direct pushes.
- **Deploys are from tags**, from an image built by CI and pinned by digest —
  never `docker build` on the VPS, which makes "what is running in production"
  unanswerable.
- **Migrations still run at startup** (D-039 era) and that stays, but the
  rollout is now: back up, deploy, verify `/readyz`, and keep the previous
  image tag one command away.

**Rejected:** a self-hosted runner (a second thing to patch and monitor).
Auto-deploy on merge to `main` — the gap between "tests pass" and "I want this
live" is where a solo operator's judgment lives.

### D-062 — Observability is a feature, not a log file *(amends D-045)*

Today: JSON `slog` to stdout, chi's `RequestID`, and `/api/health` pinging the
database. That is a genuinely good start and it is not enough to operate
against — nothing records how long a request took, nothing counts errors, and
nothing tells you a deploy broke something except a user noticing.

- **Request logging middleware** — method, path, status, duration, request ID,
  and `user_id` when there is one. Never the body, never a token, never an
  email address.
- **The request ID travels**: into every log line, into the error response, so
  a user's screenshot maps to a log query.
- **`/healthz` (liveness — process is up) and `/readyz` (readiness — database
  reachable, migrations applied)** as separate endpoints. The current
  `/api/health` conflates them, which means a database blip looks like a dead
  container to anything watching.
- **Metrics** at `/metrics`, bound to localhost or behind auth: request rate,
  latency histogram, error rate, pgx pool saturation. Pool saturation is the
  one that matters — D-028 caps the pool at 10 on a shared instance, so
  exhaustion is the most likely way this app falls over.
- **Error tracking** (Sentry or equivalent) on panics and 5xx, because a
  `Recoverer` that writes to stdout on a box you do not read is not an alert.
- **Alerts**, few and real: readiness failing, error rate spiking, the nightly
  backup not completing. An alert that fires and is ignored is worse than none.

**On D-045.** The dependency budget is amended, not abandoned — see D-065.

**Rejected:** distributed tracing. One process, one database, no service mesh;
a latency histogram plus the request ID answers everything a trace would, at a
fraction of the setup. Revisit when the MCP server becomes a second deployable.

### D-063 — The test pyramid gets a frontend and an end-to-end tier

Backend coverage is real — 13 test files, table-driven, integration tests
against a live Postgres. **The frontend has zero tests**, and it is where the
last two classes of shipped bug came from: the login rate limiter that was
broken because nothing asserted a 429, and the mutation `onSuccess` returning
the invalidate promise so a delete dialog would not close.

- **Frontend unit tests** (Vitest + Testing Library) on the parts where a bug
  is silent: the date helpers, the API client's error path, the timer
  reduction, and every mutation's cache-invalidation behaviour.
- **End-to-end** (Playwright) on the core loop only — sign in, write a note,
  write a card, review it, complete a session, capture at session end — plus
  the signup → verify → reset flow from D-058, since an auth flow that half
  works locks people out of their own data. Runs in CI against the compose
  stack.
- **A tenancy test that is not optional.** One test per resource asserting that
  user B gets 404, not 403, for user A's row (D-039). With RLS landing (D-059),
  the same suite runs as the proof that policies are actually on.
- **Migration tests**: every migration applies to an empty database and to the
  previous release's schema.

**No coverage-percentage gate.** A number gates test volume, not test quality,
and the tests that would have caught both shipped bugs are behavioural
assertions that a percentage would not have demanded. The gate is the list
above.

**Rejected:** snapshot tests of rendered components (they assert that the
markup is what the markup is, and get regenerated the moment they fail).

### D-064 — A backup is a restore you have performed

`04-ship.md` S3 already says this and already requires one test restore. As a
production obligation it becomes recurring and specific:

- Nightly per-database `pg_dump -Fc konku` (never `pg_dumpall` — restoring
  Konku must not disturb the other projects on the shared instance), pushed off
  the box with restic to B2/S3, encrypted, with a retention policy.
- **The backup job alerts on failure.** A silent cron that stopped working in
  March is the standard way this goes wrong.
- **A restore drill every quarter**, into the dev database, timed, with the
  result written down. What is being measured is RTO, and an untested dump is a
  hypothesis.
- **Stated targets:** RPO 24 h, RTO 4 h. Modest on purpose — they are what a
  solo operator can actually honour, and a target you miss quietly is worse
  than a modest one you meet.
- The git vault export (D-026) remains the second line of defense and now has
  cards to export too (D-055).

### D-065 — The dependency budget is amended, not abandoned *(amends D-045)*

D-045's reasoning stands: a dependency list defensible line by line is worth
having, and Viper/zap/Wire/struct-tag validators still buy nothing here.
Production adds obligations that stdlib genuinely does not cover, so the
budget is revised rather than waived.

**Added, each with the obligation that justifies it:**

| Dependency | Obligation | Why not stdlib |
|---|---|---|
| `prometheus/client_golang` | D-062 metrics | Histograms and an exposition format, hand-rolled badly otherwise |
| `getsentry/sentry-go` | D-062 error tracking | Panic capture, grouping, release tagging |
| Playwright (dev only) | D-063 e2e | No stdlib equivalent; never ships in the image |
| Vitest + Testing Library (dev only) | D-063 frontend tests | Same |

**Still stdlib, deliberately:** logging (`log/slog`), config (`os.Getenv`),
email (`net/smtp` against a transactional provider — an SDK for "send one
templated message" is not a trade worth making), validation, rate limiting
(`internal/api/ratelimit.go` already works and sweeps its own map), and
dependency injection.

**The rule that replaces "keep it short":** a new dependency names the
production obligation it discharges, or it does not go in. "Everyone uses it"
is not an obligation.

### D-066 — Real users create obligations a personal instance did not have

The moment someone else's data is in the database, several things stop being
optional and none of them are features anyone will thank you for.

- **Data export.** Every account can export everything — notes, cards,
  schedules, review history — as markdown plus JSON. It is a legal expectation,
  it is the thing that makes "no lock-in" true rather than a claim, and the
  vault export (D-026) is most of the work already.
- **Deletion means deletion**, within 30 days, including from backups as they
  age out. Offer the export first.
- **A privacy policy and terms** that say what is actually stored (email,
  password hash, everything the user wrote), how long, and who it is shared
  with (nobody). Short and honest; a copy-pasted boilerplate is worse than
  none because it describes a product that is not this one.
- **Per-user quotas.** Note and card counts, request rate, body size. Not
  monetisation — an unbounded free write path on a shared VPS is an outage
  waiting for one bad actor, and D-028 caps the pool at 10 for the sake of
  every other project on that box.
- **A status and incident path.** When it breaks, users find out from the
  operator, and an incident gets written down. Two sentences in a file counts.
- **Secrets are not in `.env` on the VPS forever.** `SESSION_SECRET`, the
  database password, and the SMTP credentials get a rotation procedure, and
  rotating the session secret must invalidate sessions rather than crash the
  process.

**Rejected:** collecting analytics on how people study. It would be the single
most useful data set this product could have, and it is other people's learning
history. The retention metric is computed per-account, for that account, and
never aggregated across users.

### D-067 — Everything buildable is built before the VPS is touched *(re-orders 04, 06, 07; amends D-057's ordering rule)*

D-057 sequenced the work as ship → use → harden → open, and put `04-ship.md`
before `06`. That conflated two different things: **deploying** and **using**.
Once separated, almost nothing in the remaining plan actually needs the box.

**What genuinely requires the VPS**, and it is a short list:

- The deploy itself — Caddy, HTTPS, the shared network, provisioning the
  database and role
- Nightly backups running as a cron *on the box*
  > **Amended by D-088.** Both of the above shrank. The box is
  > `Katzelabs/platform` now: the network is `platform`, TLS and hostname
  > routing come free from the edge, and the nightly `pg_dumpall` plus its
  > off-box shipping and watchdog already run for every tenant. What is left of
  > the first item is provisioning and the `konku_app` bootstrap; the second is
  > a verification, not a build.
- **Email deliverability** — SPF, DKIM and DMARC on a real sending domain
- The half of the release pipeline where the VPS pulls an image by digest
- Uptime monitoring and alert routing against a real endpoint
- Opening signup
- **Phone access**, which is what makes daily review realistic rather than
  theoretical

Everything else — RLS, observability code, security headers, the whole test
pyramid, CI, signup, verification, reset, export, deletion, quotas — is local
work against `docker-compose.yml`, which is self-contained precisely so that
`git clone && docker compose up -d db` works (D-024).

**So the order becomes:** local hardening (`06`) → local account work (`07`
L1–L9) → deploy and the VPS-only residue (`04`) → open signup (`07` L10).

**Three things follow from this, and the first is the one that matters:**

1. **Daily use starts now, locally.** D-030's failure mode — months building a
   learning tool, none learning — is not solved by deferring the work, it is
   solved by *using the app*. The gate was never "deploy"; it was "use it".
   Running `make dev-web` daily satisfies most of what S4 was protecting, and
   it must start immediately rather than at the end of 68 hours of hardening.
   It is a **weaker** gate than the original, honestly: reviewing on a phone
   during dead time is the behaviour the product depends on, and a laptop-only
   instance does not test it. That part of S4 survives the deploy.
2. **The local database becomes real data, so it needs a real backup.** Weeks
   of notes accumulating in a Docker volume with no dump is exactly the failure
   this project's thesis exists to prevent. A local `pg_dump` is now part of
   `06`, not something that waits for the VPS.
3. **Deliverability stays an untested unknown until the deploy.** It is the
   one item here with a real chance of surprising you late, because
   verification mail landing in spam is an outage that looks like a signup bug.
   Build against a local SMTP catcher, and treat the first real send as a task
   with its own risk rather than a formality.

**RLS gets cheaper, not riskier.** Doing it before there is production data was
already the argument in `06` P1; this ordering strengthens it.

**Rejected:** deploying a bare MVP first "to have something live." It buys a URL
and costs a second migration path — schema changes from `07` L1 would then run
against real data instead of dev data, which is the same reasoning that put 05
before 04 in the first place.

---

### D-068 — Resend over SMTP, on its own account and its own domain *(answers D-058's provider question)*

`07` L2 said to decide the provider "with the flow in front of you, not
before". This is that decision.

**Resend, addressed with stdlib `net/smtp`.** Resend exposes a plain SMTP
endpoint (`smtp.resend.com`, username the literal string `resend`, password an
API key), so the transport is already in the standard library and D-065's "name
the obligation this dependency discharges" test never has to be argued. An SDK
for "send one templated message" is not a trade worth making.

**One shared `.com`, one Resend account, all projects.** `katzeapps.com` is
registered and verified with Resend; Konku sends as `konku@katzeapps.com` and
is served at `konkuapp.katzeapps.com`. Other projects get their own local part
and their own subdomain on the same domain.

This is the amendment: the first version of this decision argued for a
*separate* domain and a *separate* Resend account per project, on the grounds
that sender reputation and account suspension are shared blast radius. That
argument is still true and is now an accepted cost rather than a refused one,
because the thing it was protecting against is speculative and the thing it
cost was real — the free tier allows exactly one custom domain, so a domain
per project means paying $20/mo for Pro or juggling an account per project.
One domain for everything makes the free tier fit permanently, and puts SPF,
DKIM and DMARC in one place instead of one place per project.

**What that costs, stated plainly, because it is the part that will bite if it
ever bites:** every project on `katzeapps.com` shares one sender reputation and
one DMARC policy. If another project ever sends bulk or marketing mail from
this domain, Konku's verification mail is what degrades — and the symptom is
new accounts that appear stuck with nothing wrong in the logs (D-067). The rule
that follows: **this domain sends transactional mail only.** Anything
resembling a campaign gets its own domain, not a new local part here.

**Not a cheap TLD, and that part stands.** `.xyz`, `.top`, `.club` and similar
are filtered more aggressively — Spamhaus reports abuse rates above 40% of
registered domains on some of them — and correct SPF/DKIM/DMARC does not fully
compensate for TLD reputation. Saving nine dollars a year to raise the spam
rate on the one message that gates account creation is a bad trade.

**Sending from the apex rather than a `mail.` subdomain** follows from sharing:
a per-project subdomain would mean a separate Resend domain entry per project,
which is the limit this decision exists to stay under. The separation between
projects is the local part.

The domain was never only an email cost. `04-ship.md` S1 needs a hostname for
Caddy's TLS regardless.

**Rejected:**

- **A domain per project.** The clean answer on reputation, and it does not
  survive contact with the pricing: one custom domain on the free tier means
  either $20/mo or an account per project, to isolate a risk that only
  materialises if one of these projects starts sending mail it should not.
  Revisit if that ever happens — the migration is DNS and one env var.
- **Amazon SES.** Genuinely cheaper ($0.10 per 1,000) with effectively
  unlimited verified domains, which would have made per-project domains free.
  Not chosen: 4–16 hours of setup and a support request to leave the sandbox,
  against traffic measured in dozens of messages a month.
- **A free domain** (`.eu.org`, a community subdomain like `is-a.dev`). Shared
  parent-domain reputation, with none of the branding being right.

**What this does not settle: deliverability.** Nothing here can be verified
locally. L2 builds against a Mailpit catcher; the first real send is `04` S4
and it carries its own risk (D-067).

---

### D-069 — Terhapus empties after 30 days, except for anything ever studied *(amends D-019, D-056)*

Soft delete meant nothing ever actually left the database. That was right for
one account and wrong the moment anyone can sign up: the quota in `07` L8
counts **live** rows, so a create-and-delete loop grows the tables without ever
meeting a limit. The write rate limiter bounds how fast; nothing bounded the
total.

**Notes and cards deleted more than 30 days ago are removed for good**, by a
job inside the server process that runs daily.

**A card that was ever reviewed, or ever appeared in an exam attempt, is kept
indefinitely** — the window does not apply to it. This is the part worth
defending. `review_logs` and `exam_attempt_cards` deliberately carry no foreign
key to `cards` (D-050), so the database would happily let a purge orphan them:
retention evidence would survive pointing at nothing, and a finished attempt
would render a question with no text. Only the predicate in the query prevents
that. The history is the part of a card that matters, and D-029's "cannot be
reconstructed retroactively" applies to what the history *refers to* as much as
to the history itself.

What the purge is actually for is the other kind of card — created, never
studied, deleted. That is exactly the churn an abusive script produces and
exactly the row nobody will miss.

**The window is stated in the UI, and that is not optional.** Every delete
dialog, both Terhapus views and the privacy policy now say 30 days; the card
copy says both halves, because "kartu yang pernah kamu ulang bisa dikembalikan
kapan saja" is a different promise from the one made about a note. A trash that
empties itself is ordinary. A trash that empties itself *silently* would be the
disappearance this product exists to prevent, and the copy is what makes the
difference between the two.

**In the process, not in a cron.** A cron is a second thing to install and a
second thing to notice has stopped, and the failure mode of forgetting it is
precisely the unbounded growth the job exists to prevent. The first sweep is
delayed five minutes after boot so a crash loop cannot become a delete loop.

**Rejected:** counting deleted rows against the quota instead. It bounds
storage with no new machinery, and it makes emptying Terhapus a prerequisite
for writing again — friction on capture, which hard rule 7 puts above almost
everything.

**Rejected:** purging cards regardless of history and letting past attempts
render blanks. The `LEFT JOIN` in the attempt query means the score survives,
so this is *nearly* harmless — but "nearly" is doing the work of destroying the
question text of an exam somebody sat, to save a row.

---

### D-070 — Zod for the signed-out forms, and nothing else *(amends D-053, tested against D-065)*

The eleventh frontend runtime dependency, added when the signup form went from
two fields to five and grew a confirm-password rule that no single `<input>`
attribute can express.

**D-065's test, applied honestly: this one nearly fails it.** The rule is that
a new dependency names the production obligation it discharges, and client-side
validation discharges *none* — the security boundary is `internal/api`, which
validates every one of these rules again for a request that never loaded any
JavaScript. A form library cannot be justified as protection, and it is not
being justified that way here.

What it discharges is a different obligation, and a real one: **the rules exist
in two places and have to keep agreeing.** The minimum password length, the
name bound, the address shape and the trimming are all decided by the Go
handlers, and the screens have to state the same thing in the same words before
the round trip. A schema is a place to write that down once per form and read
it back as both a validator and a type. The alternative that was weighed and
rejected was a hand-rolled ~80-line validator — it would have worked, and it
would have been a worse version of the same thing, re-derived, with the parsed
output typed by hand.

**Scope is the price of admission.** Zod is for the four signed-out forms and
their five schemas. It is not an API-response validator — the client trusts its
own server, and parsing every response would be ceremony charged per request
for a mismatch that a single deployed binary makes impossible. It is not a
general form runtime either: `useZodForm` is 60 lines in `lib/`, deliberately
not react-hook-form, because four short forms with no arrays and no wizards use
about that much of one.

**Rejected: making the client the enforcement point.** Stated because it is the
tempting reading of "add validation to secure the input". Nothing in
`web/src` secures anything. Anyone can `curl` the endpoint, and the tests that
prove the rules hold live in `internal/api/signup_test.go`, not in vitest.

---

### D-071 — An account has a name *(amends 07 L1)*

Until migration 00010 an account was an address and nothing else, which is fine
for one user and wrong the moment the app addresses anyone: every screen that
wanted to name someone showed the raw address, and `Halo hrofiyani@gmail.com`
is the tell of software that does not know who it is talking to.

**First name required, last name optional, both `NOT NULL DEFAULT ''`.** The
distinction a nullable column would carry — "we never asked" versus "they left
it blank" — is one nothing in the product acts on, and `emit_pointers_for_null_types`
would spread a `*string` through the handler, the response and the export to
represent it. An empty string is already unambiguous, because "" is not a name.

**Optional means optional.** Plenty of people have one name, and a form that
refuses to accept that is a form telling them they are wrong about their own
name. The field is marked *(opsional)* in words rather than by the absence of
an asterisk on the others.

**Not pattern-matched against letters, only bounded and stripped of control
characters.** There is no character class that spans real names — apostrophes,
hyphens, spaces, non-Latin scripts — and every attempt at one rejects somebody.
The control-character rule is the one with teeth rather than manners: a name is
the obvious thing to greet someone by in mail, and a CR or LF in a value that
reaches a header is header injection, so it is rejected at the boundary and no
future template has to remember. Escaping is *not* done: the renderer emits
React elements and never innerHTML (D-018), so a name containing `<script>` is
text on the screen — and stripping it would silently rename people.

**Existing accounts backfill to ''**, and the UI falls back to the address for
them. Deliberately not a migration that invents names out of email local parts:
guessing that "hrofiyani" is someone's first name and greeting them by it is
worse than the fallback.

The name is in the export (`data/user.json`) and named in the privacy policy,
with the policy's coverage test extended to fail if it stops being — which is
the mechanism, and the reason adding a stored field is more than a migration.

---

### D-072 — Signing out is one code path, and it writes the user before it clears the cache

A bug, and the fix is a rule worth stating because the wrong version looked
obviously correct.

`useLogout` called `queryClient.clear()` and then wrote `null` over `auth/me`.
Both lines do what they say and the result was that **logging out did nothing
visible** — the app stayed on the page it was on, and only a manual reload
reached the login screen.

`clear()` *removes* every query, and an observer bound to a removed query is
never notified; it keeps returning its last result until something else
re-renders it. `useMe` is called by `App`, `useLogout` by `AppShell`
underneath it, so the settled mutation re-rendered the child and left the
parent holding the signed-in user. The `setQueryData` afterwards did not help
either: writing to a removed key builds a *new* query that the stale observer
is not watching. The cache was genuinely empty and the screen genuinely did not
care.

**So the order is: write `null` first, through the query the observer is bound
to, then `removeQueries` for everything else.** `auth/config` is kept — it is
instance configuration with nobody's data in it, and dropping it blinks the
signup link off the login screen being shown.

**All four paths that end a session share one helper.** Logout, revoking the
current session, a password reset and deleting the account each had their own
copy of the broken pair.

**The test is at the app level, and that is the point.** The hook's own test
asserted the cache was emptied and passed throughout — it agreed with the bug,
because the screen does not read the cache. What is asserted now is that
clicking "Keluar" reaches the login form with no reload.

**Also: the account menu's "Keluar" is `destructive`.** Not because signing out
is punitive — hard rule 6 still holds — but because it is the one item in that
menu that throws away what you are in the middle of, and it sits directly under
"Pengaturan". In `SettingsPage` it stays secondary, where red is spoken for by
deleting the account.

---

### D-073 — The resend wait starts when a message is sent, not when the screen opens

Sixty seconds between verification mails, counted down in the button's own
label.

It is **not** a security control and is not offered as one. The server already
limits by IP and by target address; a client-side timer is deleted by anyone
who opens devtools. What it addresses is the ordinary case: the mail takes a
few seconds, the button is right there, and four presses send four messages to
a mailbox about to receive one. The person doing that is the account holder,
attacking nothing, spamming their own inbox.

**The deadline is persisted, not the remaining seconds.** A counter in state
resets on reload — and reloading is exactly what this screen used to tell
people to do after clicking the link. Persisting an absolute time makes the
wait the same sixty seconds whether the tab stayed open or not. It is keyed by
address, so signing in as someone else does not inherit the previous account's
wait, and it is clamped on read: a deadline further out than the cooldown means
a clock change, and failing toward "you may resend" is correct when the button
being locked is the only one that unsticks a signup.

**Only the signup success screen starts a wait on arrival**, because only there
is arriving *itself* a message being sent. Signing in to an unverified account
lands on the same screen and sends nothing; a wait imposed there would be sixty
seconds charged for a mail that never existed.

**And the screen no longer asks for a reload.** It re-reads `/auth/me` when the
tab regains focus, which is what actually happens after someone clicks the link
in their mail and comes back. Scoped to that one screen rather than turning
`refetchOnWindowFocus` back on globally: it is the only screen whose entire
content is a fact that routinely changes while you are looking elsewhere.

---

### D-074 — Categories get a colour and a management screen *(amends D-054)*

Migration `00011` puts a `color` column on `categories`, and Pengaturan gains
an "Atur kategori" page beside "Atur domain".

D-054 said categories have no colour, and that reasoning was about **list
rows**: domain colour is the one colour signal in a row, and a second tinted
palette beside it turns a list into confetti. That is still true, and it is
still enforced — the colour arrives as the same 10px dot a domain wears, on the
same neutral outline chip. What is rejected remains rejected: no tinted chip
fills, no coloured backgrounds behind category text.

What did not survive contact was **management**. Domains had a screen where
they are named, coloured, given a quota and archived. Categories had
create-on-type and nothing else, which is the right way to *create* one — being
sent to a settings screen to define a label before you may apply it is exactly
the friction hard rule 7 forbids — but it left a vocabulary that could only
grow. A typo became a permanent second category. Nothing could be renamed,
retired, or told apart from its neighbour at a glance. Giving the two the same
shape is what makes one settings screen able to manage both, and colour is part
of that shape rather than a decoration bolted onto it.

**Create-on-type stays colourless, and stays idempotent about it.** The picker
in the note and card editors posts a label and no colour; the server assigns
the neutral default. Posting an existing label returns that category *unchanged*
rather than recolouring it — otherwise typing a familiar word mid-note would
silently undo a choice made in Pengaturan. The one place that can recolour is
the settings screen, which is a PATCH: `{ color }` alone is a valid request, so
recolouring never has to echo back a label it might have read one render stale.

**The column is CHECK-constrained as well as validated in the handler**
(hard rule 9). The value ends up in an inline `style` attribute, so "the
handler always checks it" is one mechanism and therefore a hope. `domains.color`
has no equivalent constraint; that is a gap in `00001`, not a precedent — it
needs its own migration, because it has to cope with whatever the existing rows
contain.

---

### D-075 — Ulangan absorbs Ujian *(supersedes D-048; renames the tables of D-049 – D-051)*

They were one feature with two names. Both ask a card, both take `ingat` /
`lupa`, both are answered on a screen that says "prompt, reveal, judge", and
their answers have shared one table since `00002` — `review_logs.source` has
been telling them apart for as long as both have existed. What separated them
was build order: the due queue shipped in `03`, exams in `00002`, each with its
own screen, its own nav entry and its own vocabulary for the same act.

Migration `00012` renames `exams` → `review_sets`, `exam_attempts` →
`review_runs`, and their two child tables to match. `review_logs.source`
becomes `'due'` / `'set'`. `/api/exams` and `/api/attempts` collapse into
`/api/review/{due,sets,runs}`, and "Ujian" disappears from the nav.

**The due queue stays the default path, and that is the load-bearing part.**
`/review` leads with "Ulangan hari ini" and a Mulai button; saved sets are a
second section underneath. The temptation in a merge like this is to make the
configurable thing the front door, because it is the thing with options. That
would be a regression disguised as a feature: the scheduled queue is what
answers *"cepat paham tapi cepat lupa"* (`GOALS.md` #5), and it only works if
it is what you land on. A queue you have to choose to configure your way into
is a queue that depends on discipline, which is problem #1.

**Why not `review_sessions`.** `auth_sessions` and `focus_sessions` already
exist, and D-052 renamed a table specifically to end the "which sessions table"
ambiguity. A third one would undo that for nothing. A saved configuration is a
`review_set`; one sitting of it is a `review_run`.

**What the merge fixed while the tables were open anyway:** a set filters on
many domains and many categories instead of one nullable `domain_id` — the
organising axis the user actually uses day to day was invisible to the one
feature that most needed it. And a set can be unarchived, which an exam never
could; archiving is supposed to be the safe alternative to deleting, and a safe
alternative you cannot undo is only half of one.

**Unchanged, deliberately:** an answer inside a set still never moves
`card_schedules` (D-049), attempts are still snapshotted and resumable (D-050),
and a set that has been run still archives rather than deletes (D-051). Only
the names moved.

**Rejected:** deleting the due queue's separate screen and folding it in as
"just another set" — that is exactly the demotion described above.

### D-076 — Question format belongs to the set, not the card

A review set carries `format`: `recall` (prompt, reveal, self-judge) or
`choice` (four options, graded on the server).

`cards.type` exists and admits `'cloze'` and `'feynman'`, and it would have
been the obvious place to hang this. It is the wrong place. The same card
should be free recall today and multiple choice tomorrow — that is what makes
the second format worth having at all — and a property of the card cannot
express that. Format is a property of *the asking*.

It also keeps a promise. D-055 said explicitly that standalone card CRUD makes
a type picker easy to add, "which is exactly why it is worth saying no here
explicitly." Putting the choice on the set adds the feature without adding the
picker: cloze and feynman stay deferred (D-031), and the card editor gains
nothing to fill in.

**Rejected:** a per-card format field, and reusing `cards.type` for it.

### D-077 — Distractors are sampled, snapshotted, and the answer is tagged

Three decisions that only make sense together.

**Sampled, not authored.** The wrong answers in a choice question are the
`back` of the user's other cards, drawn at run start. Asking someone to write
three plausible wrong answers per card would tax capture, which is the one cost
this product protects above everything (hard rule 7), and it would make the
format unavailable on every card already written. One pool is read per run
rather than three per question — a 50-question run would otherwise be 50 extra
round trips inside the transaction that starts it, and distractors repeating
across a quiz is ordinary rather than a defect. A set whose filters are too
narrow to fill four options widens to the whole account; an account too small
even for that asks the question as plain recall instead of refusing to start.

**Snapshotted.** `review_run_cards` gains `options` and `correct_index`, filled
at draw time for the same reason the draw itself is (D-050): options
regenerated on resume would mean the second half of a run is answering a
different question from the first. The option *text* is stored, not card ids —
that table has no foreign key to `cards`, so a distractor whose card is later
deleted would otherwise leave a blank option in finished history.

`correct_index` is stored and never serialized. `ListRunQuestions` does not
select it and the wire type has no field for it; it is read one row at a time,
on the request that grades. Shipping it with the question list would put the
answer key one dev-tools glance away, which is D-003 defeated by a different
route than the one that decision was written about.

**Tagged.** `review_logs.format` records whether the answer was recalled or
recognised. Multiple choice is strictly easier — a 1-in-4 guess is worth a
quarter of a mark and D-004's headline number would count it as remembering.
The tag lets the retention metric default to `format = 'recall'` and include
recognition only when asked. It lives on the log row rather than being joined
from the set because `run_id` is `ON DELETE SET NULL`: discarding a run must
not quietly reclassify its answers, and D-029's whole point is that this cannot
be reconstructed afterwards.

**Said out loud in the UI**, not buried: the create form tells the user that
recognising an answer is easier than recalling it and that the number will read
higher. A metric that flatters without saying so is the failure this app is
supposed to be the opposite of.

**Rejected:** authored options per card; a `choice` answer that moves the
schedule; and logging choice answers indistinguishably from recall.

---

### D-078 — The view toggle is the only control over the index screens *(amends D-074's sibling change)*

`/notes` and `/cards` had two controls deciding overlapping things: a view
toggle for how the *list* looked, and a peek-mode preference — side, centre,
full page — for how the *item* looked, switched from a row of buttons sitting
above every previewed note and remembered in localStorage. Six combinations,
each of which had to work, to express two layouts anybody actually wanted.

**One toggle now answers both.** A **list** is narrow and leaves room beside it,
so the page splits and the preview is the second column. A **grid** takes the
whole width and leaves no room, so the preview is a modal. The preference, the
`full` mode and the button row are gone. `PeekMode` survives as a rendering
shape rather than a stored choice, and still calls the first one `side` because
that is what every machine's localStorage already says and renaming it would be
a migration in exchange for nothing.

**List view opens its top row on arrival**, and re-opens when the open item
leaves the list — filtered out, searched past, deleted. A second column is only
worth its width if something is in it, and arriving to "pilih catatan untuk
membacanya di sini" makes the first thing the screen asks you to do a click it
could have made for you. It **replaces** rather than pushes, so Back never
walks through a selection the user did not make.

That is also why the side preview has **no close button and no Escape
handler**. There is no "nothing selected" state to close *to* — closing would
re-select immediately. The Escape handler it used to have was worse than
useless: it called `navigate(-1)` against a history entry auto-selection had
already replaced, so pressing Escape on the note list left the note list.
Switching to grid is what closes the preview.

**The filters became searchable multi-selects.** Chips were readable at five
seeded domains and stopped being readable the moment categories became
create-on-type: a filter bar that grows a line every time you label something
pushes the list it filters off the screen, and it could never express "either
of these two". Within a group the values are OR'd and between the groups
AND'd — the same semantics a review set's draw uses (D-077), because two
screens filtering the same vocabulary two different ways is a bug waiting to be
reported as one. "Both labels at once" was the other available reading of
multi-select and it is the wrong one here: the second click would almost always
empty the screen, which reads as broken rather than as precise.

The wire format is a repeated parameter — `?domainId=a&domainId=b` — not a
comma-joined value, so nothing has to agree on a separator or escape one out of
a label. `uuidListQuery` returns an **empty slice, never nil**: pgx encodes a
nil Go slice as SQL NULL, `cardinality(NULL)` is NULL, and the "no filter" arm
of the WHERE clause is a cardinality test — so a nil would turn "filter by
nothing" into "match nothing" and empty both index screens.

**`@radix-ui/react-popover` is the one new dependency**, and it discharges an
obligation `DropdownMenu` cannot: a Radix menu owns typeahead, so a text input
inside one loses its keystrokes to the menu, and searching is the entire
interaction here. It is the same reason `CategoryProperty` expands inline
rather than in a menu. Every one of popover's transitive dependencies was
already installed by `dialog` and `dropdown-menu`, so the lockfile grew by
exactly one package (D-065).

---

### D-079 — Pengaturan is a shell with one section in it, not a column with all of them

`/settings` was a single column of seven stacked sections: account, export,
sessions, theme, delete-account, a paragraph of legal text, and two links out
to `/domains` and `/categories`. Everything was on screen at once, which had
three costs. The screen had no shape you could learn, so finding the theme
meant scrolling and reading. The one irreversible action in the app sat two
scrolls under the email address, on the path of every ordinary visit. And the
two label screens were reached through a card that existed only because there
was nowhere else to put a link — going from Domain to Kategori was two
navigations through a page nobody wanted to be on.

**Each section is a route now, under one shell.** A rail on the left says
where you are and what else there is; the column on the right holds exactly
one section. `/settings` redirects to `/settings/akun`, so every existing link
— the sidebar, the account menu, Beranda's "Atur", a bookmark — still lands
somewhere.

**`/domains` and `/categories` keep their URLs** and render inside the shell,
via a pathless layout route. They were linkable before this and moving them
under `/settings/` to make the paths tidy would break that for nothing. The
"← Pengaturan" link each of them opened with is gone: the rail never leaves,
so there is nowhere to go back *to* that is not already on screen. The sidebar
carries `alsoActiveOn` for the same reason — Pengaturan has to stay lit while
you are on a settings screen that lives at its own URL.

**The rail is a strip on phones**, not a menu. A phone has room for the nav or
the section, not both, and a full-height list you walk back through is the
shape this rework is undoing. The open section scrolls itself into the strip:
seven items do not fit across a phone, and arriving at Data & privasi from a
link put the current section off the right edge while the nav claimed you were
on Profil.

**Read-only account fields stopped being disabled `<Input>`s.** Nothing writes
a name or an address yet (00010, D-071), and a greyed-out box still looks like
a box you could type in. They are text with a line saying so.

**Rejected:** a settings index page listing the sections, which is one more tap
to everything and a screen whose only content is a menu; moving the label
screens under `/settings/` and redirecting the old URLs, which is churn for
tidiness; and putting Pengaturan's sections in the app sidebar, which would put
seven settings entries beside five daily destinations.

---

### D-080 — A card previews as a card, with two sides

The card peek was the note peek with different labels: a metadata row, the
question, a rule, the answer, all at once down one column. Nothing it showed
was wrong and everything it *said* was — a card read as a short note with two
fields, which is precisely the shape D-055 spent a migration getting out of.
The one screen where you handle cards as objects rendered them as documents.

**It is the object now.** One face at a time — `Pertanyaan`, then `Jawaban` —
and a turn between them you can watch happen. `components/ui/flashcard.tsx`,
so the review screens can reach for it later without reimplementing it.

**This is not recall-before-reveal and must never be mistaken for it.** D-003
is a *server* guarantee: `/api/review/due` and `/api/cards` ship no `back` at
all, so the answer is not in the page to be found. The peek already holds the
whole card — you fetched it on purpose, to read it — and here the flip is a way
of handling the thing, not a lock on it. Two consequences worth stating: both
faces are in the DOM the whole time, and that is fine here and would be a
defeat of D-003 anywhere that tests you. Anything that tests you asks the
server at reveal time, the way `ReviewPage` does.

**The faces share one grid cell.** Absolutely positioning them collapses the
parent to zero height and forces a fixed one, which either clips a long answer
or floats a three-word question in a box sized for something else. One cell
makes the card as tall as its taller side and keeps that height across the
turn — a card that resizes mid-flip reads as two panels swapping places, which
is the impression this whole change exists to remove.

**The flip is 300ms, not the 200ms `calm` token.** It is the one motion in the
system that carries information rather than orientation, and under about 250ms
the turn is not seen — the answer simply appears, which is the thing the flip
exists to avoid saying. `--animate-duration-flip`, `ease-quiet`, no bounce.

**Neither face is `bg-card`.** It sits inside a peek panel and inside a dialog,
both of which are `bg-card` themselves, so a `card` face is a rectangle of
border and nothing else — in both themes. The front is `surface` and the back
`muted`: distinct from their container, distinct from each other, and neither
tinted with the accent, which in this palette means "selected", nor with
anything that could read as a verdict on an answer (D-054). Hover moves the
*border*, because every neutral fill pairing is degenerate in one theme or the
other (`border` = `input` in light, `muted` = `secondary` in dark).

**The hidden face is `inert`.** It is turned away, not removed, so without it a
tab lands on a link on the back of a card you are looking at the front of, and
a screen reader reads out an answer to a question it has not read yet. The
flip's own announcement is a polite live region, since both faces are mounted
and nothing is inserted for a reader to notice.

**The card is a click target and the button is the control.** A `<button>`
cannot legally contain the links markdown renders, and `role="button"` on a div
full of prose is a worse lie than no role — so the face takes a plain click
handler that declines twice: on a link (notes and cards carry source URLs,
D-013) and on a live text selection, because selecting an answer to copy it
ends in a click, and turning the card over at that moment destroys the
selection and the intent with it.

**Rejected:** hiding the answer behind a second click *as a safeguard*, which
would be ceremony imitating D-003 on a screen that already has the answer in
hand; a stacked-deck edge behind the card, which implies a pile where there is
one card; and tinting the answer face with the accent, which in this palette
means "selected" and, on an answer, comes uncomfortably close to a verdict.

---

### D-081 — `/metrics` binds `0.0.0.0` in the container and publishes no port *(amends D-062)*

D-062 put `/metrics` on its own listener bound to loopback, on the reasoning
that a separate socket cannot be exposed by a Caddy misconfiguration the way a
route on the main mux can. That reasoning is still right and the listener stays
separate. The **bind address** was wrong, and wrong in the way that is hardest
to notice: it looked like the careful choice.

A container has its own network namespace. `127.0.0.1:9090` inside it is the
*container's* loopback — not the host's, and not the `platform` network's. So
nothing could scrape it: not a host agent, not a sibling Prometheus, not
`curl` over SSH. The comment in `docker-compose.prod.yml` claimed the metrics
were "reachable from the box and not from the internet", and neither half was
true. **Pool saturation is named in D-062 as the metric most worth watching,
and it was observable only through `docker exec`.**

**Production binds `0.0.0.0:9090` and lists no `ports:` entry.** The privacy
comes from not publishing, which it always did — an unpublished port is
unroutable from the internet whatever it binds, while a container on `platform`
can still reach it. The bind address was never what was protecting anything.

**The default in `internal/config/config.go` stays `127.0.0.1:9090`,** because
the default is for a process running on a host, where loopback means what it
looks like it means. The container is the exception and says so explicitly.

Three comments — `config.go`, `.env`, `.env.example` — read "never bind this to
0.0.0.0 (D-062)". All three were changed with this decision. A rule stated in
three places and contradicted in a fourth is how a fix gets reverted six months
later by someone who read the rule and not the exception.

**The one line that would make this public is `9090` in `ports:`.** It is not
there, and the compose file now says so where somebody would add it.

**Rejected:** publishing to the host's loopback (`127.0.0.1:9090:9090`), which
works and is what a host-level agent would want, but adds a published port to
buy something the `platform` network already provides — and D-062's instinct to
keep the surface minimal is worth honouring where it costs nothing. Also
rejected: putting `/metrics` back on the main mux behind an auth check, which
trades a socket boundary for a code path, and code paths are the thing that get
misconfigured.

---

### D-082 — Argon2 runs at most four at a time, and acquisition does not take a context

The parameters were right per hash and said nothing about how many hashes there
are. Every limiter in front of a hashing route is per-IP or per-address, so 100
source addresses bought 100 concurrent 64 MiB verifications — and `/auth/signup`,
`/auth/reset` and `DELETE /account` each carried their own budget, so the budgets
added rather than sharing a ceiling. On a shared VPS that is an OOM for every
co-tenant project, which is the same argument that caps the pgx pool at 10
(D-028).

**Four slots**, against the container's `mem_limit: 512m`, so the bound is
stated twice and neither statement is the only one (hard rule 9).

**Acquisition blocks and takes no `ctx`,** which is the part worth recording
because it looks like an oversight. Requests queue behind the router's 30s
timeout instead of the box swapping, and a queued goroutine costs ~8 KiB — the
resource being protected is memory, not goroutines. Threading a context through
`Hash` and `Verify` would change every call site to solve a problem this does
not have. If hashing ever needs to be abandoned early rather than queued, that
is a different decision and should be made deliberately.

**Consequence for the endpoints that hash:** the verification must not happen
inside a transaction. `DeleteAccount` and `ChangePassword` both read the user in
one user-scoped transaction, verify outside it, and write in another — holding
one of ten pool connections across ~100ms of argon2, possibly plus queue time,
would turn the endpoints designed to be slow into a way to exhaust the pool.

**Rejected:** deriving the slot count from `NumCPU`, which ties a memory bound
to a CPU count and gets it wrong on exactly the small shared box this protects;
and making it configurable, which invites an operator to tune it past the
container's memory limit and silently undo the pairing above.

---

### D-083 — `user_settings` is wired, not dropped, and two of its columns stay unread

Migration 00007 created the table, signup writes a row, the exporter serialises
it, and until now nothing read it. Schema carrying no behaviour is what later
gets a half-finished endpoint bolted onto it, so the choice was to wire it or
drop it. Dropping it would mean another migration to bring it back and the
rediscovery of decisions already made — D-037's N, the timer default, the rota
being opt-out — so it is wired.

`GET`/`PATCH /api/settings`. Singular and unaddressed: there is exactly one row
per account and the caller is the key, so there is no id in the URL and the
tenancy failure this guards against is not a wrong uuid but a query that forgot
whose row it was reading.

**`default_duration_minutes` gets a real consumer** and the other two do not.
`focusStepN` and `rotaEnabled` round-trip correctly and have no control on
`/settings/preferensi`, because the features they belong to are not built.
Shipping a switch that changes nothing would be worse than the unread column it
was meant to fix — it would look like a feature.

**The account default is applied to an idle timer when the default changes, not
on every render.** The timer persists whatever duration you last picked, so
re-asserting the account default on each settings refetch would silently undo a
one-off choice made seconds ago. It fires twice and both are right: when the
settings first arrive on a device, and when the person changes the default.
`status === 'idle'` keeps it from moving a duration out from under a running
session.

**The theme stays in `localStorage` and is not moved here.** It is a property of
a screen on a device, not of an account: the same person on a phone at night and
a laptop at noon wants different answers, and syncing it would make one of those
wrong. `/settings/preferensi` and `/settings/tampilan` are separate screens that
each say which of the two they are.

**Rejected:** a partial `PATCH`, which would need a pointer on every field to
tell "absent" from `false` — and `rotaEnabled: false` is a value somebody means.
The client holds the whole object because it just rendered it, so it sends the
whole object.

---

### D-084 — The index lists page, and the header counts the collection

Both index screens truncated silently and then stated the truncation as the
total. `/notes` applied its default limit of 50 while the client sent no
`limit` and no `offset` and had no control that could; `/cards` asked for 500
against a query whose SQL ended at `LIMIT` with **no `OFFSET` at all**, so card
501 was unreachable by any request the API was able to express. Both headers
rendered the length of the returned array — "50 catatan" to an account holding
300 — and the notes search box filtered that same array in the browser, so
looking for something written last month returned nothing and looked like an
answer.

Those notes and cards existed. They counted against the `07` L8 quotas of 5.000
and 20.000, they came back in `/api/export`, and they could not be opened. That
is the disappearance this product exists to prevent, reached by a different
door, and the quota ceilings are what make it a matter of time rather than a
hypothetical.

**One shape for both lists:** `{items, total, limit, offset}`. A breaking change
to two endpoints with no external consumers, so it is a rename rather than a
migration. The settings lists — domains, categories — still answer with a bare
array, because they are bounded by what a person will sit down and create.

**`total` is a window function on the list query**, not a second count. The
header states it beside a page drawn from the same predicate, and two queries
with two copies of the same `WHERE` clause can drift until the number and the
list are describing different things. The one hole in that is an empty page:
the total rides on the rows, so an offset past the end has nothing to carry it.
`pageTotal` re-asks *the same query* for one row from the top rather than
introducing a second predicate — one extra round trip on a page nobody
normally lands on.

**Offset, not keyset.** Notes sort by `updated_at DESC`, which mutates, so
offset paging can in principle shift a row across a page boundary. Every note
and card mutation invalidates the whole list key and TanStack refetches every
loaded page, so a local edit recomputes the loaded pages consistently from
offset 0; the remaining window is an edit from a second device between two page
fetches. Keyset would close it and costs a cursor, a compound comparison, and
the total. At a 5.000-row ceiling that is not the trade. Both queries did get
`id` as a tiebreaker — without a total order, a page boundary landing inside a
tie serves one row twice and skips another, which is the same disappearance in
miniature.

**A button, never a scroll sentinel.** In list view the left column is a scroll
container beside a live preview whose top row opens itself on arrival (D-078);
loading on scroll would move the ground under both, and a reader scrolling to
the bottom to see how far the list goes would find it never ends. The button
says how many are left, because the point of the change is that the screen
stops implying the collection ends where the page does.

**Search moved to SQL** — `ILIKE` on `title`, the same shape `ListCards` has
had, against `notes_title_trgm_idx`, which has existed since `00001`. Not a
migration and not full-text: ranked search is still deferred (D-031) and the
placeholder still says "judul". Paging is what forced it: over a page, "no
match" and "not on this page" are the same empty screen.

**Two lists nobody counted got fixed on the way past.** The fixed-set card
picker built its own request, dropped the domain filter entirely when a set
named more than one — offering every card in the account — and read the first
500 as all of them; it is the shared `useCards` now. And the select-all
checkbox reaches the loaded rows, so it is named `Pilih semua yang tampil`
whenever another page exists: "semua" beside a header reading 300 would promise
300 and act on 50.

**Rejected:** numbered pages, which imply a stable index into a list ordered by
a mutating timestamp; an `X-Total-Count` header, which puts the number outside
the cached response body that the screen renders it from; and leaving the card
list's honest "Menampilkan 500 kartu pertama" notice in place, which named the
truncation without offering any way past it — its own comment said paging was
the fix.

---

### D-085 — A crash in the browser reports to our own origin

A throw during render unmounted the entire tree. What the person got was a
white page with no reload affordance and no explanation; what we got was
nothing at all, because Sentry runs in the Go process and `connect-src 'self'`
has no exception for an ingest host. So the one part of this application that
executes on somebody else's machine was also the one part that could fail
silently — the gap between "hardened" and "operable".

**Two boundaries, not twenty-five.** One around everything, outside the router,
which catches a throw in a provider or on the signed-out screens. One inside
`AppShell` around the `<Routes>`, which is what makes a broken screen a broken
*screen*: the sidebar, the nav and the timer stay alive, so the way out is a
click rather than a reload. Wrapping each of the twenty-five route elements
individually would produce the same containment and twenty-five places to
forget.

**The route boundary clears itself on a path change, through a prop and not a
`key`.** A changing `key` unmounts and remounts the subtree every time it
changes, and the obvious key here is the pathname — which changes every time a
peek opens over a list (D-084). That would throw the list away underneath its
own preview on every click. `componentDidUpdate` comparing `resetKey` resets
only a boundary that has actually failed and touches nothing otherwise.

**Reporting goes to our own origin, and the server forwards it.** The
alternative was adding the Sentry ingest host to `connect-src` and running the
browser SDK. That costs a CSP exception on the policy that is the second
mechanism behind D-018, a runtime dependency against a budget that requires a
named production obligation (D-065), and a third party receiving events from
the page directly. `POST /api/client-error` costs one handler. The CSP is
unchanged, `package.json` is unchanged, and this process stays the only thing
that talks to Sentry.

**The endpoint is unauthenticated on purpose.** The crash worth catching most
is the one on the login screen — the screen a broken account cannot get past —
and a reporter that only works once you are signed in would be silent for
exactly that case. What makes it safe to leave open is that it is an allowlist
of four fields rather than a passthrough, bounded at 16 KiB and again per field
after decoding, and limited to thirty an hour per address like every other
unauthenticated write path.

**No user id on the event**, which is a departure from `reportError` and
deliberate. Attaching one means resolving a session, and `auth.Resolve` writes
— it throttles a `last_seen_at` update behind the read — so labelling a crash
would make the crash path depend on a database write and move a "last used"
timestamp on the sessions screen. "One account or all of them" is answerable
from the volume and the route.

**The report is not logged, only counted and forwarded.** A crash report *is* a
request body, and rule 10 says a body never reaches the logs. The message and
the stack go to Sentry, which is the sink built for them; the log line carries
the request id, the kind and the sanitised route, so "the frontend is crashing"
is visible on a box with no DSN at all — which is also what
`konku_client_errors_total` is for.

**The route is sanitised twice.** The browser sends `location.pathname`, never
`href`, because on the index screens the query string is the search box's
contents. The server takes it apart again — drops anything past `?` or `#`,
replaces every uuid with `{id}`, caps the length, and answers `unknown` for
anything that is not a path. The client half of a guarantee is one bug away
from not running (hard rule 9), and this value ends up in a log line and an
event tag, which is exactly where `routePattern` already refuses to put a raw
path.

**Bounded on both sides.** Five reports per page load and one per distinct
error in the browser — a component that throws, is caught, and throws again on
the next render is the case that would otherwise flood — and the per-address
limit on the server for a client that ignores its own cap. Deduplication keys
on the error and not on the kind, because React re-throws an error a boundary
already handled so `window.onerror` still sees it, and one bug arriving as two
events makes "how many things are broken" unanswerable.

**Rejected:** the Sentry browser SDK (CSP exception, dependency, and a third
party the page talks to directly); `navigator.sendBeacon`, which cannot set
`Content-Type: application/json` and would be refused by `enforceOrigin`
(D-060); reporting through `api/client.ts`, whose `ApiError` on a 429 would
surface as an unhandled rejection, which is one of the two things this module
listens for; and a `route` label on the metric, which arrives in a request body
and would mint a time series per value somebody chose to send.

---

### D-086 — The launch polish: a theme before the paint, a debounced URL, and an entry the login screen can afford

The last tier of the frontend audit (F-07 – F-12). Nothing here was broken;
each one is the difference between a working deploy and one that survives being
opened on a phone, which is what `04-ship.md` S6 is for.

**The theme applies from a blocking script in `<head>`, not from an effect.**
`ThemeProvider` toggled `.dark` inside `useEffect`, and an effect runs after
the first paint by definition — so every reload for a dark-theme user painted
the light palette and flipped it a frame later. The header comment claimed the
choice "applies before the first paint"; localStorage makes that *possible* and
the effect is what actually scheduled it. The usual fix is an inline script,
which the CSP has no `'unsafe-inline'` for and is not getting one for a theme.
`web/public/theme.js` is a same-origin file, which satisfies `script-src 'self'`
with no policy change at all. It cannot be `type="module"` — a module script is
deferred by definition, which would put it back after the paint it exists to
precede — so it cannot import, and it restates the storage key and the two
chrome colours that `useTheme.tsx` also holds. `useTheme.test.ts` reads the file
and fails when the two drift, which is the second mechanism (hard rule 9).

**`theme-color` is rewritten rather than declared twice.** A `media` pair in the
markup follows the OS, which is wrong for the one case this app actually offers:
an explicit dark choice on a light system. One meta tag, set from the resolved
theme by the same two places that set the class.

**The search box holds its own text; the URL gets it 250 ms later.** Both index
screens wrote `?q=` from `onChange`, so every keystroke was a `replaceState` —
and each one changed the filtered id list, which re-fired `useAutoSelect` into a
second `navigate(…, {replace: true})`. Two history writes per character, against
a Safari limit of roughly a hundred in thirty seconds. Since D-084 the query is
also part of the React Query key, so it was one request per character as well.
The URL stays the source of truth for the *filter* — that is what makes a search
a link — and stops being the source of truth for each letter. `SearchInput`
tracks the last value it agreed with its parent on, so it can tell its own echo
coming back through the router from a real outside change like Back or a cleared
filter; without that distinction the sync overwrites whatever was typed during
the round trip. Enter commits immediately, because waiting out a debounce after
someone says they are done reads as a dropped keystroke.

**Every screen is its own chunk, and the login form is not.** The build was one
805 kB file: every route, the markdown renderer, all five Radix packages, zod
and the lucide graph were in the first byte the *login screen* needed. `lazy()`
on the route elements — plus `AppShell` and `TimerProvider`, which are the
signed-in application and were being downloaded to render an email field — takes
the signed-out entry from 241 kB gzipped to 121 kB. `LoginPage` stays eager: it
is what a signed-out visitor is here for, and making it lazy trades a smaller
entry for a round trip before anything renders. `manualChunks` pins only the
framework, by package name and never by a path match — a function testing
`id.includes('react')` also catches react-markdown, and the failure is silent.
The rest of the split is Rollup's own, which is why the markdown renderer lands
beside the note and card screens rather than in the entry. `npm run check:bundle`
in CI is the second mechanism: turning one `lazy()` back into a static import is
a one-line change nothing else would notice, and its whole cost is paid by
whoever opens the login screen on mobile data.

**Signing out clears the app's localStorage, on an allowlist.** It cleared the
query cache and nothing else, so the theme, the sidebar, both view modes, the
resend cooldown and the running timer's state carried into the next account on a
shared browser. `clearAccountStorage` sweeps the `konku.` and `konku:` prefixes
and keeps exactly one key — the theme, which is a property of the screen and not
of the account. An allowlist rather than a list of things to remove, so a key
added next year is swept by default instead of leaking by default.

**The resend cooldown keys on a hash of the address, not the address.**
`konku:resend-until:you@example.com` wrote an email address into persistent
storage on a possibly shared device, where it outlived the session and even
account deletion. Rule 10 keeps addresses out of logs for the same reason.
FNV-1a and not a digest, stated plainly in the comment: this is not protecting a
secret from someone holding the device, it stops an address being *displayed* —
and SubtleCrypto is async, so it could not produce the key the first synchronous
read needs.

**`index.html` grew a head, and the mark is generated from one description.**
Favicon, description, `theme-color`, apple-touch-icon, a manifest, and the
`mobile-web-app-capable` pair, because the phone pass in S6 is going to be
looking at a home-screen shortcut. `scripts/icons.mjs` emits the SVG and every
PNG from the same geometry, in Node stdlib — iOS ignores SVG for a home-screen
icon, so a raster is unavoidable, and a raster nobody can regenerate is a binary
that quietly becomes wrong the day the accent changes. The maskable variant is
full-bleed on purpose: the launcher does the cropping, and rounding the corners
ourselves would put a transparent notch inside its crop.

**Unhashed files at the dist root answer `no-cache`.** Everything under
`/assets` is content-hashed and immutable for a year; `theme.js`, the icons and
the manifest keep the names they were written with, and `theme.js` in particular
restates a storage key that lives in the app. A stale copy is a theme that stops
applying before the first paint — revalidation is one 304 on a file the browser
already has.

**A skip link, and two labels that were placeholders.** The shell renders the
same sidebar, top bar and bottom nav before the only part of the page that
changed, so arriving anywhere by keyboard meant tabbing all of it again. `<main>`
takes `tabIndex={-1}` as well, or the fragment moves the scroll and leaves focus
in the sidebar. The note title, the note body and both sides of a card were
labelled only by placeholders — text that is gone exactly when the field has
content, which is most of the time it is read. The card editor's caption was a
`<span>` that looked like a label and was associated with nothing; `<label
htmlFor>` is the same pixels and also clicks into the field.

**Rejected:** weakening the CSP with `'unsafe-inline'` for the theme script;
`purpose: maskable` on the rounded icon, which would be cropped into a notch;
virtualising the long lists, which F-12 raised and D-084 changed the shape of —
fifty rows a page is not where that cost lives; and clearing the theme on sign
out, which would repaint the login screen white on a device somebody
deliberately set to dark, in the name of a privacy it does not provide.

### D-087 — Ulangan pages too, and the lists that must not

D-084 fixed the two index screens and stopped there. An audit of every remaining
list endpoint found the same failure in a corner it had not swept, plus two
lists that would be actively worse for being paged — so this decision records
both halves, because the second is the one a later pass is likely to undo.

**The framing was wrong, and it matters.** This was raised as a performance
task. It is not one: D-086 already rejected virtualising the long lists on the
grounds that fifty rows a page is not where that cost lives, and the endpoints
left unpaged hold tens of rows, not thousands. The reason to do it is the one
D-084 was built on — a row that exists, counts against the quota, appears in the
export, and cannot be reached from the app is the disappearance this product
exists to prevent. Reachability, not speed.

**A set's run history had a `runsPerPage` and no page after it.** `ListRuns`
ended at `LIMIT $3` with the constant `20` hardcoded at the call site and no
`OFFSET` in the SQL at all — the exact shape `ListCards` had before D-084. Work
a set through twenty-one sittings and the twenty-first was counted in
`runCount`, written to the export, and shown nowhere. It is now
`GET /api/review/sets/{id}/runs`, its own paged endpoint with a `count(*) OVER
()` total, an `id` tiebreaker, and the shared `page[T]`.

**The history lists finished sittings only, and the open one moved to the set.**
The detail response carried `runs` and the screen picked the unfinished one out
of it with a `.find()`. That works only while the list is complete: once it is a
page, "is there a sitting to resume" becomes a question about which page
loaded rather than about the set. The detail now carries `openRun` from
`GetOpenRun` — a partial unique index already guarantees at most one — and the
history is finished-only, which also makes its `total` exactly the `runCount`
the set reports. Two queries that must keep agreeing, and a test that fails when
they drift.

**`/api/review/sets` had no `LIMIT` in its SQL at all.** Each row carries three
correlated subqueries (the run count and two `array_agg`s), so the Ulangan
screen ran all of them once per set the account had ever made, on every visit.
It pages now. This is the one place in the change where the query cost was real,
and it is still not why it was done.

**The focus log gets a total and deliberately no offset.** `/api/sessions`
answered with a bounded slice and no count, so thirty rows read identically
whether the account held thirty sessions or three hundred — D-084's misinforming
half. It answers with the envelope now, for `total` alone: there is no `?offset=`
and no **Muat lebih banyak**, because browsing back through months of sessions
is the Activity log (PRD §5.10) and that stays deferred. The panel states
"Menampilkan 30 sesi terakhir dari 312" and offers nothing to press. Adding the
offset later is a two-line change; adding it now would be building the deferred
feature by accident.

**Rejected: paging `/api/domains` and `/api/categories`.** They feed the
searchable multi-select filters and the create-on-type pickers, which filter the
whole list client-side. A paged source would make "no match" and "not on this
page" the same empty state — precisely the bug D-084 removed by moving note
search into SQL, reintroduced one layer down. They stay bare arrays, and the
absence of a quota on them is a known gap rather than an oversight: an account
with ten thousand categories has a stranger problem than a slow picker.

**Rejected: paging `/api/review/due`.** The cap is D-009 and it is the feature.
Returning after two weeks to forty due cards is demotivating regardless of
styling, and a **Muat lebih banyak** under the due queue would be a button whose
only function is to undo the one mechanic protecting against quitting. It
already reports its true total separately so the screen can say "sisanya besok".

**Rejected: keyset pagination**, for the same reasons D-084 gave — every
mutation invalidates the whole key and TanStack refetches every loaded page, so
the drift window is an edit from a second device between two page fetches, and
these collections are smaller than the ones offset already serves.

---

### D-088 — The box is `Katzelabs/platform`, and Konku is a tenant of it *(amends D-024, D-025, supersedes part of D-064)*

**Decision:** the VPS is owned by a separate repo, `Katzelabs/platform`, whose
`PLATFORM.md` is the deploy contract for every app on the machine. Konku obeys
it. The network is **`platform`**, not `shared`; the shared Postgres is **18**,
not 17; and backups are the platform's `pg_dumpall` pipeline, not a Konku cron.

D-024 described an `infra/docker-compose.yml` holding Caddy, Postgres and Mongo
on a network called `shared`. That stack was extracted out of Tuan Tanah and
rebuilt: the edge is now a **standalone** caddy-docker-proxy (`compose/edge.yml`)
that is the only thing on the box publishing a port, the data tier is a separate
compose project so restarting the proxy cannot risk the database, and Mongo is
not on the box at all. The network was renamed in the process. Konku's compose
file declared `shared` as `external: true` for a network that has never existed
under that name, so the first deploy would have failed at `up`, before anything
interesting could go wrong.

**Postgres 18, and dev and CI move with it.** The platform tracks the most
demanding tenant, which is Konku (pgvector), and it is pinned to
`pgvector/pgvector:pg18` — EOL 2030-11-14, chosen deliberately over 17 because a
major bump is a coordinated dump/restore for *every* tenant and doing it now
costs one tenant and ~8 MB. Konku's dev compose and CI were on pg17. Testing a
different major than the one holding real users' data is exactly the drift the
platform README warns about, so both moved. pg18 also **changed `PGDATA`** to
`/var/lib/postgresql/18/docker`, so the dev compose mounts the parent and lets
the image own the subdirectory; the old volume is left in place and
`make db-upgrade-pg18` dumps through a throwaway pg17 container rather than
touching it, because the dev database holds real review history (D-067, D-029).

**Konku imports none of the edge's shared header snippets, and that is a
considered deviation.** PLATFORM.md's template says `caddy.import:
security_headers` so that a new service cannot forget its headers. Konku does
not forget them — `internal/api/security.go` sets the whole set, with a stricter
`Permissions-Policy` than the snippet and two headers (COOP, CORP) it does not
have. Caddy's `header` directive *sets* rather than merges, so importing the
snippet would quietly replace this app's values with weaker ones. It would also
break HSTS: the platform Caddyfile documents that two `header` directives in one
site block do not merge — Caddy keeps the first and silently drops the second —
so an import plus Konku's own `caddy.header.Strict-Transport-Security` label
yields one of them, no warning, and a header that ships nowhere. `csp_spa` is
refused for the same reason plus a worse one (it allows `style-src
'unsafe-inline'` and `connect-src wss:`, and D-060's policy allows neither), and
`no_uploads` caps bodies at 64 KB against a 256 KiB markdown allowance. HSTS
stays the one header the edge adds, because only the component terminating TLS
knows the connection was secure.

**The deploy has one ordering trap, and it is written down because nothing
enforces it.** `cmd/konku` opens the pool and pings it *before* it runs
migrations — deliberately, so a bad `DATABASE_URL` fails at startup rather than
on the first request. But `konku_app` is created by migration `00006`, as
`NOLOGIN` with no password, because a password in a migration is a secret in
git. On a fresh production database the first boot therefore authenticates as a
role that does not exist yet, and `restart: unless-stopped` turns that into a
loop whose log line reads like a network problem. `make provision` on the
platform side creates the **owner** only. So the app role is an explicit operator
step before the first `up`, and `00006`'s `IF NOT EXISTS` guard is what makes
doing it early safe. This is the same thing CI has always done and `make
db-app-role` does locally; production was the only place it was unwritten.

**Backups: Konku configures nothing** (superseding D-064's restic plan and
`04-ship.md` S3). The platform's nightly `pg_dumpall` covers every database on
the instance, ships to R2, and has a watchdog that is silent when healthy and
already alerting for Tuan Tanah. Building a second, Konku-specific pipeline
beside it would double the thing that can rot without anyone noticing. Two
consequences are Konku's problem and are recorded in `deploy.md`: a `pg_dumpall`
is one file containing every tenant, so a Konku-only restore is
`pg_restore`-into-a-scratch-instance and never `psql <` against production; and
retention is now enforced in a different repo from the one that promises it —
14 days locally, ~28 in R2, against a `/privacy` promise of 30, which holds by
four days and would be falsified by an edit to `ship-backups.sh` that nothing in
this repo would fail on.

**Rejected: adding a `/health` alias.** PLATFORM.md's contract asks for `GET
/health`. Konku serves `/healthz` and `/readyz` and the split is D-062 — the
correct response to each is the opposite of the other, and collapsing them is
how a database blip becomes a restart that throws away the warm pool. Nothing on
the platform actually probes the path: the edge routes by hostname and the
healthcheck is Konku's own, in Konku's compose file. So this is a documentation
mismatch, not a behavioural one, and the right fix is a line in PLATFORM.md
rather than an endpoint here.

**Rejected: keeping `Caddyfile` as an unchecked reference copy, silently.** It
still exists and is still the readable statement of what the labels produce, but
it now says so at the bottom, in the imperative: verify against the running
edge's admin API, and delete the file rather than let it drift. It described
`reverse_proxy app:8080` on a network that did not exist, which is precisely the
failure it warned about in its own header.

### D-089 — `provision-db.sh` prints instructions that contradict this repo, and the screen wins *(amends D-088, protects D-059)*

**Decision:** `deploy.md` states the two-role split as a table at the top of
`### Roles and database`, and names the provisioning tool's own closing output
as wrong, rather than relying on being correct somewhere further down the page.
A runbook does not compete on equal terms with a tool that prints conflicting
instructions in the operator's terminal at the moment of use.

**What the tool prints.** `make provision` ends by telling the operator to put
`DATABASE_URL=postgres://konku:<password>@postgres:5432/konku` — the **owner** —
into the app's `.env`, and then to run `make migrate`. Both are wrong for Konku,
in different ways. The owner belongs in `MIGRATION_DATABASE_URL`; `DATABASE_URL`
must be `konku_app`. And Konku has no `make migrate` target at all — it has
`migrate-up`, and does not need it on the box, because the binary migrates at
startup.

**Why this is worse than a stale comment.** The `make migrate` half fails
loudly: there is no such target, the operator reads the runbook, and the
contradiction resolves itself in ten seconds. The `DATABASE_URL` half fails
silently and permanently. Connecting as the owner produces an application that
starts, migrates, serves, and passes every test — and a table owner bypasses its
own RLS policies, so the row-level security behind the whole tenancy story is
inert. That is D-059 exactly, reached by trusting a tool rather than by
disagreeing with the design. Nothing downstream catches it. There is no error,
no failing check, and no symptom short of one account seeing another's data.

**And the runbook was already correct.** This is the part worth internalising.
`deploy.md` said the right thing before this deploy started — `DATABASE_URL` is
marked "**`konku_app`** — never the owner, never `postgres`" in its variables
table. Correctness was not the problem. Ordering and adjacency were: the wrong
instruction appears in the terminal, in the same minute, as output of the
command the operator has just been told to run, and it arrives formatted as the
next step. The right instruction is in a document they read earlier. Written
guidance loses that contest often enough that the runbook has to spend words
saying the tool is wrong, not merely saying what is right.

**The fix belongs in `Katzelabs/platform`.** The script should either print
nothing about `DATABASE_URL` or print the tenant's actual convention. Konku does
not write to that repo (D-088), so this is handed back to the platform's
operator and recorded here in the meantime. Konku's side of it is done: the
table, and the explicit note that `make provision` creates the owner only.

**Rejected: fixing it only in the platform script.** Even repaired, the
generic tool cannot know a given tenant's role convention, and the runbook would
be relying on it to stay repaired. `deploy.md` has to stand on its own against a
tool it does not control.

**Rejected: treating this as a documentation nit.** The two-role split had been
written down since D-059 and was still misread during this deploy's own recon,
from this same script. A rule that is recorded, correct, and reliably misread
under operating conditions is not adequately recorded.

### D-090 — A two-role tenant needs a grant that neither repository owns *(amends D-088, completes D-059)*

**Decision:** `GRANT CONNECT ON DATABASE konku TO konku_app` belongs in
`deploy.md`'s role block, in the same `psql` invocation as the `CREATE ROLE`.
A least-privilege split is not finished when the second role is created. It is
finished when the grants that make that role usable exist — and on this platform
those grants fall between two repositories, with neither file wrong on its own.

**What broke.** The first production boot restart-looped eleven times on
`FATAL: permission denied for database "konku" (SQLSTATE 42501)`. Everything the
runbook prescribed had been done: `konku_app` existed before the first `up`,
with `LOGIN`, with a password, `rolsuper=f`, `rolbypassrls=f`. It authenticated
successfully and was refused at the database door. Migrations never ran; the
`public` schema had no tables.

**Where the seam is.** `provision-db.sh` hardens every tenant database by
revoking `CONNECT` from `PUBLIC` and granting it to the owner alone. That is
correct and should stay. Konku then adds a *second* role afterwards, by hand,
from its own runbook — and the platform's default correctly excludes a role that
did not exist when the default was applied. The provisioner cannot know about a
role a tenant will create later. The runbook did not know the provisioner had
closed the door. Neither document is incorrect in isolation, and their union is
a service that cannot start.

**Tuan Tanah could never have surfaced this.** It runs a single role where the
role name, the database name and the owner are all `tuantanah_prod`, and a
single-role tenant is granted `CONNECT` by the provisioner as a matter of
course. **Konku is the first two-role tenant on this box**, and the two-role
split exists because D-059 requires it: a table owner bypasses its own RLS
policies, so the app must not connect as the owner. The gap therefore opens
precisely for the tenant that implements tenancy properly, and stays invisible
to the one that does not need to.

**This is D-089's shape at a different seam.** Two artifacts, each correct,
producing a broken outcome because nothing owns the join between them. D-089
bites through an instruction printed at the wrong moment and fails silently
forever; this one bites at first boot and fails loudly. Loud is better, and it
is still worth a record, because the loudness is misleading — see below.

**The symptom collides with the trap already documented.**
`store: connecting to database` was already this page's named warning sign for
the `00006` `NOLOGIN` ordering trap. It is now the log line for two different
causes with two different fixes, and an operator applying the documented remedy
to the new failure changes nothing. `deploy.md` now carries the discriminator:
`password authentication failed` is the old trap; `permission denied for
database … 42501` means authentication *succeeded* and `CONNECT` is missing.

**The knowledge was already in the file, on the wrong shelf.** `deploy.md`'s
Backups section states that "provisioning revokes `CONNECT` from `PUBLIC`" — as
part of reasoning about whether `pg_dumpall` can still see the database. The
fact was written down, in the right document, and never carried across to the
role that has to log in.

It was not filed carelessly, and that is what makes this hard rather than
embarrassing. The sentence carries its own reasoning — the revoke "does not
affect the superuser" — which is a correct and complete answer to the question
being asked there. There was no error to catch when it was written, and no
reviewer of that paragraph would have found one. The cost appeared only when a
different question needed the same fact. Facts filed correctly under the
question that raised them do not migrate to the question that later needs them,
and nothing signals the omission at either end.

**Rejected: granting `CONNECT` to `PUBLIC`.** The one-word fix, and it would
undo the provisioner's hardening for **every** database on the shared instance —
handing every tenant role a connection to every other tenant's database. The
revoke is the platform doing its job. The tenant that added a role is the party
that has to account for it.

**Rejected: moving the grant into migration `00006`.** The natural second guess,
and it cannot work: it is circular. Migrations run over
`MIGRATION_DATABASE_URL` as the owner, but `cmd/konku` opens the pool as
`konku_app` and **pings it before it migrates** (D-088's ordering trap). So the
grant would sit behind a connection that the absence of the grant prevents. The
`GRANT` has to happen outside the application, before it starts, which is
exactly where the `CREATE ROLE` already was.

**Rejected: loosening the provisioner to take a second role.** That is a change
to `Katzelabs/platform`, which Konku does not write to (D-088), and it would put
Konku's role convention inside a generic tool that serves every tenant. The
runbook is the right owner: it is the document that knows this tenant has two
roles.

### D-091 — A backup check that asserts a name is not a backup check *(amends D-088's backup section)*

**Decision:** `## Backups`'s coverage check gains a second assertion, on
`CREATE TABLE public.users`, and both are kept. Asserting that a database is
**named** in a dump does not establish that its **data** is in the dump. Those
are different claims, `pg_dumpall` emits the first for a database holding
nothing, and the runbook was treating one as evidence of the other.

**How it was caught.** The prescribed check —
`gunzip -c … | grep -c 'CREATE DATABASE konku'   # must be 1` — was run against
the first nightly after the deploy and returned `1`. It passed. The same dump
measured differently: two `CREATE DATABASE` statements, four `CREATE TABLE`
statements, and all four of them Tuan Tanah's. Konku has 20 tables live and
none of them were there. The file contains `CREATE DATABASE konku`,
`\connect konku`, and then nothing at all. Restoring it produces an empty
`konku` beside a complete `tuantanah_prod`.

**The cause is a thirty-minute window and it is nobody's mistake.** The `konku`
database was created at 10:40:42 UTC, the nightly `pg_dumpall` ran at 10:56:19,
and Konku's migrations ran at 11:10:23. The dump landed after the database
existed and before its schema did. Every component behaved correctly. The
window exists because provisioning and first boot are separate operator steps
with a gap between them, and the nightly does not know or care where in that
sequence it falls.

**Why it earns a record rather than a line in the runbook.** The failure
returns **green**. A check that fails loudly gets fixed; a check that passes
wrongly ends the investigation, and this one would have signed the deploy off on
backup coverage that did not exist. It is also the third distinct instance this
deploy has produced of the same underlying error — after the `https://` probe of
a plaintext listener and the `/metrics` status-code check — of an assertion that
cannot distinguish the healthy case from the broken one.

**The generalisation is the transferable half: this is a presence check
standing in for a content check.** The substitution is available anywhere a
backup, an export, a sync or a migration is verified by asking "is the name
there" — the name is cheap to emit, survives every interesting failure, and
reads as proof. Ask instead for something only the working case can produce.

**No fix was required and nothing was at risk.** Worth stating plainly, because
a finding this size invites emergency action that would be wrong here. The
sidecar has run six dumps with six `ok` results and zero restarts. Tuan Tanah is
captured completely **in the very same dump**, which is precisely what makes the
result trustworthy rather than a broken pipeline. Konku's coverage self-heals at
roughly 10:56 UTC the following day, now that migrations have run. Every Konku
table currently holds zero rows.

**Rejected: treating the passing check as coverage.** It is the whole finding.
The check was green, the coverage was absent, and the gap between those two
facts is the thing being recorded.

**Rejected: running `make backup-now` to force coverage.** Two independent
grounds. It writes into `Katzelabs/platform`, which Konku does not touch
(D-088). And it would actively make matters worse: `ship-backups.sh` ships
`ls -t backups/pg_dumpall_*.sql.gz | head -1`, a glob that matches
`pg_dumpall_manual_*`, so a manual dump taken after the nightly **displaces** it
and that day's real nightly is never shipped off-box at all. The remedy would
have cost the off-site copy of the day it was trying to protect.

---

## Open questions

None blocking. Deferred details, intentionally left until the feature is being built:

- **Feynman grading output format** (D-036) — v0.3
- **Progressive focus N** (D-037) — currently 5, tune against real session data
- **Do random set draws include mastered cards?** (D-048, renamed by D-075) — currently yes.
- **Review over notes** — cards only for now. A note has no `back` to hide and
  no ladder to sit on, so it is a different interaction rather than a filter
  on this one. Nothing in `00012` blocks it.

**Closed:** *per-user settings have nowhere to live* — `user_settings` lands in
migration `00007` (`07` L1), carrying progressive focus N, default timer
duration and the rota preference. The values are still the old constants; D-037
remains open on tuning N, which is now per-account data rather than one
person's.

Opened by the production shift (D-057 – D-066):

- **What bounds the cost of an open signup** (D-066). Quotas cap storage; they do not cap the number of accounts. Invite codes, a waitlist, and "open and watch" are all defensible; the answer depends on how the launch actually goes.
- **The rate limiter is per-process** (`internal/api/ratelimit.go`). Correct for one container, wrong the moment there are two, and D-023 rejected Redis for a problem that did not exist yet. It exists once a second instance does — not before, and running two instances is not currently planned.
- **How much of `GOALS.md` survives having other users.** It is written in the first person about one person's constraints, and D-057 promotes its rules to product constraints without rewriting it. Whether it becomes a product-principles document or stays a personal one that the principles cite is unresolved.

Opened by the first deploy (2026-08-20):

- **Is the `platform` network meant to be flat?** The external audit found that
  it is, and that Konku's ports are reachable across it by other tenants'
  containers. Verified directly from another container on the shared subnet:
  `konku-app-1:9090/metrics` returned all 92 metric lines and
  `konku-app-1:8080/readyz` returned `200`, both bypassing the edge and every
  security header it applies. `tuantanah-web-1` and `tuantanah-backend-1` sit on
  the same subnet and can reach both.

  This is **not** internet exposure. No port is published, `docker port
  konku-app-1` is empty, and the public surface audited clean. It is a lateral
  surface *between tenants*, and metrics endpoints routinely carry route names,
  hostnames and traffic volumes.

  It bears on D-081 specifically. That decision chose `0.0.0.0:9090` inside the
  container deliberately, reasoning that "an unpublished port is unroutable from
  the internet whatever it binds, while a container on `platform` can still
  reach it" — sibling reachability was the entire point, and it was correct
  about the internet. What it did not weigh is that `platform` carries other
  **tenants**, not only Konku's own containers. The choice is not disturbed by
  this; its blast radius is simply larger than the record accounts for.

  **Unresolved, and not Konku's call to make.** Whether a flat shared network is
  the intended tenant model belongs to `Katzelabs/platform` and its
  `PLATFORM.md`. If it is deliberate — one operator, no untrusted tenants, which
  is the reasoning D-024 already accepts for sharing Postgres — then nothing is
  wrong and this closes as answered rather than fixed. If it is not, the remedy
  is segmentation on the platform side and no change to Konku. It is recorded
  here as an observation with evidence, and not as a decision, because nobody
  has taken one. Structurally it *would* resemble D-089 and D-090 — a seam
  between two repositories that neither owns — but only under the second answer.
  Under the first there is no seam, only a property of the contract that was
  never written down.

  **The same property has a second consequence: app-to-Postgres traffic is
  plaintext.** `ssl=off` in `pg_settings`, and `pg_stat_ssl` reports `ssl=f` for
  Konku's live connection. This is the surviving half of the
  `tls error: server refused TLS connection` line that appears at boot — the
  error is structurally true and simply stopped mattering the moment the
  plaintext fallback succeeded (see `deploy.md`, where it is flagged as benign
  noise for a *different* reason). On a Postgres instance shared with another
  live tenant, query traffic crosses the bridge in the clear.
  `password_encryption` is `scram-sha-256`, so authentication is not
  plaintext-equivalent; the query stream is. It belongs here rather than as its
  own item because it is the same underlying question: on this box "internal"
  means "shared with another tenant", not "Konku only", and how much that
  matters depends on the same unanswered call.

---

### D-092 — The policy narrows to the truth rather than the pipeline widening to the policy *(closes an item in `04-ship.md` S3)*

**Decision:** `/privacy` stops saying "backup terenkripsi". It now says what is
actually true of both copies — daily dumps on the box, a copy shipped to
Cloudflare R2, transfer over an encrypted connection, R2's at-rest encryption on
the off-box copy, and **the dump files themselves not encrypted by us** — with
the 30-day retention promise unchanged, because that one was always accurate.
Encrypting the local copy was the other option on the table and was rejected.

**What was wrong.** `PrivacyPage.tsx` claimed encrypted backups. The platform's
`scripts/backup.sh` writes `pg_dumpall --clean --if-exists | gzip -9`, and
`ship-backups.sh` `rclone copy`s that same file to R2. Neither step encrypts
anything. `backup-hermes.sh` says so in its own header — *"The Postgres dumps
ship to R2 in plaintext, which is a defensible call for application data"* — so
this was not even an undocumented property of the pipeline; it was documented in
the repo that owns it and contradicted in the repo that makes the promise.

**Why not encrypt instead.** It is the stronger answer and it is still available.
It is also `Katzelabs/platform` work, and it adds a key that must be kept for as
long as the oldest backup and must not be lost — a key lost is every backup lost,
which converts a confidentiality control into an availability risk against the
one asset that exists to survive everything else. D-088 already put backups
under the platform's pipeline; adding key management to Konku's promise while
the pipeline stays elsewhere widens the seam D-089 and D-090 are both about. The
cheap, honest fix is available today and does not.

**The transferable half: the L9 coverage test cannot catch this class of bug.**
That test fails when a feature stores something the policy does not mention —
it walks the *code* and checks the *page*. This was the opposite direction: a
claim on the page with nothing behind it, which no amount of coverage detects
because there is no new data to cover. The two failure modes are "the policy is
missing something" and "the policy invented something", and only the first has a
mechanism. The second now has one for this claim specifically — a test asserting
the page does *not* say `backup terenkripsi` and *does* say `tidak kami
enkripsi` — and the general form is worth stating: **every factual claim in a
published document about infrastructure we control needs to be checkable against
the thing it describes, or it is a claim nobody will check until it matters.**
Rule 9 with the mechanisms being the wording and a test, rather than the wording
and someone remembering.

**Consequence for the reader of `ship-backups.sh`.** The 30-day promise is bounded
by the weekly series' `--min-age 28d`, not by the daily `7d` and not by the box's
14-day `BACKUP_RETENTION_DAYS`. Manual dumps landing in `daily/` (`deploy.md`
records that they do) shorten how far `daily/` reaches and cannot lengthen the
outer bound, so the promise holds with two days of margin regardless of deploy
activity. If the weekly window is ever widened past 30 days, the policy becomes
untrue the same day and nothing in this repo will notice.
