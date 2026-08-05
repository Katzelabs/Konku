# 02 — Card engine

The markdown parser and the sync transaction. **The highest-risk work in the
project**: a bug here does not throw, it silently destroys review history.
Tests come before callers.

**~9 h** · needs 01 (C3 only) · blocks 03

---

## C1 — `card.Parse` — basic `Q :: A` only

`todo` · ~5 h · no deps (pure package)

Implement the stub in `internal/card/parse.go`.

```
Apa itu prior? :: Keyakinan awal sebelum melihat data <!-- c:k3n8 -->
```

Returns the cards **and** updated markdown: any card without a trailing
`<!-- c:xxxx -->` is new, so Parse assigns an ID via `card.NewID` and writes it
back into the document. The caller persists cards and markdown together.

MVP parses `basic` only. Cloze and feynman are v0.2 (D-031) — but do not
*reject* their syntax, just ignore it, so a user who writes `{{...}}` early
loses nothing.

**Test table — all of these must be covered:**

| Case | Expected |
|---|---|
| New card | ID assigned, written back into markdown |
| Existing ID | preserved **verbatim** when the text around it is edited |
| `::` inside a fenced code block | not a card |
| `::` inside inline backticks | not a card |
| Several `::` on one line | splits on the **first** only |
| Empty front or back | not a card |
| Two new cards in one note | distinct IDs |
| Card removed from markdown | absent from results (caller soft-deletes) |
| Idempotence | `Parse(Parse(md))` returns identical markdown |

That last one is the property that matters most: parsing must be a fixed point,
or every save mutates the document and the git vault export becomes noise.

**Done when:** `go test ./internal/card/` is green and `make check-pure` still
passes.

---

## C2 — `card.Insert`

`todo` · ~1 h · needs C1

The write half of the chokepoint (D-033). Appends a card to the markdown with a
freshly assigned ID and returns the updated document.

Must produce output that `Parse` reads back identically — the two are inverses
and a round-trip test should assert exactly that. This is what guarantees that
in v0.3, an agent calling `add_card` and a user typing `::` by hand converge on
the same file.

**Done when:** `Parse(Insert(md, c))` yields `c` unchanged, with a stable ID.

---

## C3 — Card sync on note save

`todo` · ~3 h · needs C1, F3

`internal/store/notes.go`. Where the transaction lives.

On `PATCH /api/notes/:id`:

1. `card.Parse` the new markdown
2. Persist the **returned** markdown, not the submitted markdown — it carries
   the newly assigned IDs
3. Diff parsed cards against stored cards **by ID only**:
   - new ID → insert card + schedule at stage 0, due tomorrow
     (`srs.NewSchedule`)
   - existing ID → update front/back/line, **leave the schedule untouched**
   - vanished ID → `deleted_at = now()`, **never** a hard delete
4. All of it, plus the note update, in **one transaction**

**Why by ID only:** matching on content means fixing a typo looks like "old card
deleted, new card created" — the schedule resets to stage 0 and months of
review history are gone. This is the single most damaging bug available in this
codebase, and it is silent (D-019).

**Why soft delete:** a user who accidentally deletes a line, saves, and undoes
should get their review history back.

**Done when:** an integration test proves that editing a card's *text* leaves
`stage`, `lapses` and `next_review_date` unchanged, and that removing a card
then restoring the same ID restores its schedule intact.
