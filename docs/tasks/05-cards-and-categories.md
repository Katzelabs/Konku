# 05 — Standalone cards and categories

Cards stop living inside note markdown and become their own feature with full
CRUD. Notes go back to being notes. Both gain shared, many-to-many categories,
and both get the Notion-shaped UI: grid/list views, a details drawer, and a
full-width editor page.

**~13 h** · needs 03 · runs **before** 04 · **K1–K8 done**

---

## Why this file exists

`D-005` said notes and cards were one system. `D-055` reverses it: they are two
features with two use cases that merely relate. The reversal is deliberate and
recorded — read `D-055` before touching anything here, because most of this
file exists to undo machinery that earlier decisions were emphatic about.

What survives the reversal, restated:

- **Editing a card's text must never reset its schedule.** This was rule 2's
  whole purpose. With a uuid primary key and an `UPDATE`, it is now free —
  there is no content matching left to get wrong.
- **Note and its categories commit in one transaction**, same for cards. Rule 3
  loses its original subject and keeps its shape.
- **Every query stays scoped by `user_id` in the `WHERE`.** Unchanged, and the
  new tables follow `D-047`'s composite-FK pattern like everything else.

---

## K1 — Migration `00004_standalone_cards_and_categories.sql`

`done` · ~1.5 h · no deps

Development data only, so this drops and recreates rather than remapping
history onto new identifiers. **It is destructive and says so in a comment.**

### Cards get a uuid identity

`note_id` is a primary key component in five tables, not a column in one:

| Table | `note_id`'s role today | After |
|---|---|---|
| `cards` | `PRIMARY KEY (note_id, id)`, `id` is the `c:xxxx` text marker | `id uuid PRIMARY KEY`, `UNIQUE (user_id, id)` |
| `card_schedules` | PK + FK to `cards(note_id, id)` | PK `(card_id)`, composite FK |
| `review_logs` | `(note_id, card_id)`, no FK by design | `card_id`, still no FK |
| `exam_cards` | PK + three-column composite FK | PK `(exam_id, card_id)` |
| `exam_attempt_cards` | PK, the attempt's snapshot | PK `(attempt_id, card_id)` |

`review_logs_one_answer_per_attempt_idx` (00003) is rebuilt on
`(exam_attempt_id, card_id)`.

New `cards` shape: `− note_id`, `− line` (a markdown line number with no
markdown left to number), `+ domain_id`, `+ updated_at`.

**`cards.domain_id` is not optional to get right.** Cards have no domain of
their own today — they inherit it by joining notes, in `DrawRandomCards` and
`ListCardsForPicking` (`queries/exams.sql`). Drop `note_id` without adding
`cards.domain_id` and both the Cards page filter and every exam draw lose their
source silently. Nullable, with the `D-047` composite FK to `domains`.

`type` keeps its `CHECK (type IN ('basic','cloze','feynman'))` but only
`'basic'` is ever written. Cloze stays deferred (`D-031`); leaving the
constraint alone means v0.2 needs no migration.

**Soft delete stays**, for a new reason. The `D-019` reason is gone — a card no
longer vanishes because a line was deleted. But `ListAttemptQuestions` LEFT
JOINs `cards` to render a finished attempt's questions, so a hard delete blanks
out past exam results. It also makes *Hapus* undoable.

### Categories

Shared across both features — one vocabulary, two join tables.

```sql
categories       (id uuid PK, user_id, slug, label, archived_at, created_at,
                  UNIQUE (user_id, slug), UNIQUE (user_id, id))
note_categories  (user_id, note_id, category_id)   PK (note_id, category_id)
card_categories  (user_id, card_id, category_id)   PK (card_id, category_id)
```

Flat, with `/` permitted in the slug (`math/aljabar`), so hierarchy becomes a
display decision later rather than a migration.

**No colour column.** Domain colour is the one colour signal in a row; a second
one competing with it is noise, and `D-054` kept the palette narrow on purpose.
Categories render as neutral chips.

`notes` needs **`UNIQUE (user_id, id)`** added — it does not have one today,
only `cards` got the equivalent in 00002, and `note_categories` cannot follow
`D-047` without it.

**Done when:** `make db-up && make migrate-up` is clean on an empty database,
`migrate-down` returns to 00003, and `make test-integration` compiles.

---

## K2 — Delete the parser, rewrite the store

`done` · ~3 h · needs K1

**Deleted:** all of `internal/card/` — `parse.go`, `insert`, `id.go` and 445
lines of tests — plus `syncCards` in `internal/store/notes.go`. `make
check-pure` narrows to `internal/srs` alone; narrow it in the Makefile, do not
drop it.

- `store/notes.go` — `CreateNoteWithCards` / `UpdateNoteWithCards` become plain
  `CreateNote` / `UpdateNote`. `SavedNote` goes with them.
- **New** `store/cards.go` — card CRUD. Create writes the card row *and* its
  `srs.NewSchedule` row in one transaction, so a card can never exist in a
  state where it is unreviewable.
- `queries/cards.sql` — rewritten: CRUD plus a list query filtered by domain,
  category and text.
- `queries/exams.sql` — `DrawRandomCards` and `ListCardsForPicking` drop the
  `JOIN notes` and filter `c.domain_id` directly. `ListAttemptQuestions` joins
  on `card_id` alone.
- `queries/notes.sql` — `ListNotes` loses the `card_count` subquery, gains
  category aggregation.
- **New** `queries/categories.sql`.
- `make sqlc`.

**Done when:** `make check` passes and no file outside `migrations/` mentions
`note_id`.

---

## K3 — Cards and categories API

`done` · ~2 h · needs K2

```
GET|POST        /api/cards
GET|PUT|DELETE  /api/cards/{id}
GET|POST        /api/categories
PUT|DELETE      /api/categories/{id}
GET             /api/review/{cardID}/answer      ← was /{noteID}/{cardID}/answer
POST            /api/review/{cardID}
GET|POST        /api/attempts/{attemptID}/{cardID}
```

Notes and cards both accept `categoryIds` on create and update. Deleting a
category that still has rows attached returns **409** with Indonesian copy —
the same `foreign_key_violation` mapping domains already use (`D-051`), never a
500.

All new routes go inside the `requireUser` group in `server.go`.

**Done when:** integration tests cover card CRUD, the 409, and a second user
getting **404** — never 403 — for another user's card (`D-039`).

---

## K4 — Markdown renderer

`done` · ~1 h · no deps

Cashes in `D-018`'s ladder one rung: `react-markdown` + `remark-gfm`, in a new
`components/ui/markdown.tsx` styled off the tokens.

Deletes `lib/markdown.tsx` (189 hand-written lines) and `lib/cards.ts` (108
lines mirroring the now-deleted Go parser in TypeScript).

**The no-`innerHTML` guarantee is not negotiable.** The old renderer produced
React elements specifically so note content could never execute, because in
v0.3 an agent writes notes through MCP. `react-markdown` keeps that property; a
`marked` + `dangerouslySetInnerHTML` swap would quietly remove it.

Still **rejected**: BlockNote / TipTap-style block editors with JSON storage
(`D-018`). CodeMirror 6 remains the next rung, and its own decision.

**Done when:** `npm run typecheck` and `npm run build` pass, and the note
preview renders headings, lists, code, tables and task lists.

---

## K5 — Shared UI primitives

`done` · ~1.5 h · needs K4

Built once in `components/ui/`, used by both features. Building them per-page
is how the same button gets reinvented in five feature folders, which is what
`/design` exists to prevent.

| Component | Notes |
|---|---|
| `ViewToggle` | grid / list; state in `?view=`, beside the existing `?q=` convention |
| `DetailsDrawer` | fixed right panel at `lg`+, Radix Dialog drawer below it |
| `CategoryPicker` | create-on-type, so capture never blocks on setup (rule 7) |
| `CategoryChip` | neutral, no colour |

Add every one to `/design`.

**Done when:** each renders in the style guide in both themes.

---

## K6 — Notes screens

`done` · ~2 h · needs K5

- `/notes` becomes list-only with grid and list views. The layout route and its
  `<Outlet>` go away.
- `/notes/:id` becomes a sibling, full-width. This also removes the constraint
  that forced preview to be a *mode* rather than side by side.
- Details drawer carries domain, categories and timestamps.

**This finally exposes the domain picker.** `PUT /api/notes/{id}` has accepted
`domainId` since A1 and the UI has never sent it, so every note in the database
is untagged and the domain filter has nothing to filter. The drawer is where it
belongs.

**Done when:** a note can be assigned a domain and categories from the UI, and
the editor uses the full page width.

---

## K7 — Cards screens

`done` · ~2 h · needs K5, K3

The same two shapes as notes, which is the point — cards are a peer feature now:

- `/cards` — grid and list, filtered by domain, category and text.
- `/cards/:id` — full-width create / edit / view.

**Front and back are multi-line markdown**, with preview. They were
single-line strings only because the parser rejected newlines outright; that
constraint died with the parser, so a card can hold a code block.

The Cards page copy inverts: it said cards are written in notes and not here.
Now here is the only place.

Review and exam screens drop `noteId` throughout — React keys
`` `${noteId}:${cardId}` `` become `id`.

**Done when:** a card can be created, edited and deleted without touching a
note, and reviewing it still moves its schedule.

---

## K8 — Docs and tests

`done` · ~1.5 h · needs K7

- `D-055` in `DECISIONS.md`, superseding `D-005`, `D-019` and `D-054`'s card
  clause — with the reasoning on the record, not just the outcome. `D-005` was
  marked *explicitly confirmed by the user*; the reversal needs to be too, or
  the next reader reinstates it.
- `CLAUDE.md` hard rules 1–3 rewritten. Rule 2 survives restated.
- `TECH.md` §4 — the card syntax section goes.
- `DESIGN.md` — category chip, drawer, view toggle.
- `README.md` in this directory — build order and remaining hours.

**Done when:** nothing in `docs/` still tells a reader to write cards inside a
note.

---

## Build order

```
K1 ──► K2 ──► K3 ──────────────► K7 ──► K8
                          ┌──► K6
K4 ──► K5 ────────────────┘
```

K1–K3 land together; the app does not build in between. K4 and K5 are
independent of the backend and can go first if you want something visible
early.
