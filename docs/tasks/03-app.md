# 03 — App

The API endpoints and the React screens. This is where the product becomes
usable.

**~26 h** · needs 01 and 02

---

## A1 — Notes API

`done` · ~3 h · needs C3, F5

`internal/api/notes.go`, inside the `requireUser` group.

```
POST   /api/notes          {title, contentMd, domainId?}
GET    /api/notes/{id}
PATCH  /api/notes/{id}     → triggers card sync (C3)
GET    /api/notes          list, newest first
```

- Tool-shaped from the start — these same operations serve MCP in v0.3 (D-017)
- `PATCH` returns the **stored** markdown, so the editor picks up newly assigned
  card IDs without a refetch
- Another user's note is `404`, never `403` (D-039)
- Validate in the handler by hand; no struct-tag validator (D-045)

**Done when:** creating a note containing `Q :: A` produces a card row with a
schedule due tomorrow.

---

## A2 — Review API

`done` · ~3.5 h · needs A1

`internal/api/review.go`.

```
GET  /api/review/due          capped ~10, oldest-due first
GET  /api/review/{noteID}/{cardID}/answer
POST /api/review/{noteID}/{cardID}    {rating: "ingat" | "lupa"}
```

> Built with the note in the path. Card IDs are unique within a note, not
> within the account — the primary key is `(note_id, id)` — so `{cardID}`
> alone cannot address a card.

- The due list returns **`front` only**. The answer is a separate request made
  when the user chooses to reveal. Shipping `back` alongside the prompt would
  let a curious dev-tools glance defeat recall-before-reveal, which is the
  mechanism the whole product rests on (D-003)
- Rating calls `srs.Next`, persists the schedule, and **writes a `review_logs`
  row every single time** — retention cannot be reconstructed retroactively
  (D-029)
- Compute `interval_before` / `interval_after` for the log
- Use `srs.Today(time.Now())` — local date, never UTC

**Done when:** rating `lupa` puts the card back tomorrow at stage 0 with
`lapses` incremented, and a log row exists for it.

---

## A3 — Focus session API

`done` · ~1.5 h · needs F5

`POST /api/sessions` — `{domainId?, durationMinutes, sessionDate}`.

`sessionDate` is the client's **local** `YYYY-MM-DD`. Do not derive it
server-side from a timestamp: a 23:00 session belongs to that day, and the
server may be in a different timezone than the user.

**Done when:** a session logged at 23:50 local stores today's date, not
tomorrow's.

---

## A4 — Note list and editor

`done` · ~5 h · needs A1, F7

`web/src/features/notes/`.

- `NoteListPage.tsx` — title, updated date, card count. Newest first
- `NoteEditorPage.tsx` — title input, `<textarea>`, live markdown preview
- `queries.ts` — TanStack Query hooks; invalidate the list after a save
- **Autosave on a debounce** (~1.5 s) plus explicit save. Capture cost is the
  thing to protect, and "did I remember to save" is friction
- After save, replace the editor content with the response's markdown so the
  assigned card IDs appear
- A short hint under the editor: `Tulis kartu dengan format Tanya :: Jawab`

**Deliberately a plain textarea.** CodeMirror is deferred until the friction is
actually felt rather than imagined (D-018) — this is the item most likely to
eat the project.

**Done when:** typing `Apa itu X? :: Y`, saving, and reloading shows the
`<!-- c:xxxx -->` comment persisted.

---

## A5 — Review screen

`done` · ~4 h · needs A2

`web/src/features/review/`.

The flow, and it is not negotiable:

```
prompt only  →  [Tampilkan jawaban]  →  answer  →  [Ingat] [Belum ingat]
```

- The answer is **not in the DOM** until the reveal request resolves
- After rating, advance to the next card without a full page transition
- Empty state: *"Tidak ada yang perlu diulang hari ini."* Calm, not
  congratulatory — no confetti, nothing to lose
- If more cards were deferred by the cap, say so plainly and without alarm:
  *"Sisanya besok."*
- Link to the source note, so a failed card leads back to context

**Done when:** the answer cannot be found in the page source before reveal.

---

## A6 — Focus timer

`done` · ~5 h · needs A3

`web/src/features/timer/`.

- Durations 15 / 20 / 25 / 30 / 45, **default 20**, short ones first in the UI —
  deliberate, the user is training focus from a low baseline
- Start / pause / reset
- **Drive from a wall-clock target, not an interval counter.** Background tabs
  throttle `setInterval` and the timer would drift; store the target timestamp
  and recompute remaining time on each tick
- Survives a refresh (target timestamp in `localStorage`)
- `useTimer.ts` is genuine client state — `useState` or a small Zustand store,
  not TanStack Query (D-044)
- On completion, log the session via A3

**Done when:** a 20-minute timer left in a background tab for 20 minutes
completes at the right moment.

---

## A7 — Capture at session end

`done` · ~4 h · needs A6, A1

`web/src/features/timer/CaptureDialog.tsx`.

Timer completes → **"Apa yang kamu pelajari?"** → one field → save creates a
note, pre-tagged with the session's domain.

- Skippable, with zero friction and zero guilt on skip
- Never a separate screen or a separate navigation step (D-011)
- Same `::` hint as the editor
- Skipping is a normal outcome — no "are you sure?", no nagging

**This task is why the timer is in the MVP at all** (D-038). The MVP exists to
test whether notes and cards actually get written; this is the strongest
mechanism in the design for making that automatic rather than an act of
discipline. If the timer ships without it, the timer was not worth building.

**Done when:** finishing a session and typing one line produces a note that
appears in the list and generates a card if it contains `::`.
