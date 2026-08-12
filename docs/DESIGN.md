# DESIGN.md — the design system

What the UI is made of, and the rules that keep it consistent. `PRD.md` says
what to build; this says what it looks like and which pieces to build it from.

**Live reference:** `make dev-web`, then <http://localhost:5173/design>. Every
token and every component variant renders there, with a light/dark toggle. It
is dev-only — `import.meta.env.DEV` folds to `false` in a production build and
Rollup drops the module, so it never reaches the embedded binary.

---

## 1. Where things live

| Path | What |
|---|---|
| `web/src/styles/theme.css` | **Every** token. The only file with hex values in it. |
| `web/src/index.css` | One line: imports the above. |
| `web/src/components/ui/` | The primitives. Owned source, not a dependency. |
| `web/src/lib/utils.ts` | `cn()` — clsx + tailwind-merge. |
| `web/src/components/layout/` | The shell: sidebar, mobile nav, focus pill. |
| `web/src/design/StyleGuide.tsx` | The living style guide at `/design`. |

Tailwind is **v4**. Tokens are CSS (`@theme`), not a JS config — there is no
`tailwind.config.js` and adding one back would split the source of truth.

---

## 2. The one rule

**A component never names a colour. It names a role.**

```tsx
// no
<div className="rounded-lg bg-white border border-slate-200 text-slate-900">

// yes
<Card>
```

```tsx
// no
className="text-slate-500"

// yes
className="text-muted-fg"
```

Raw palette classes (`bg-slate-100`, `text-red-500`, `#4F46E5`) in a feature
folder are a bug in `theme.css`, not a shortcut. If a screen needs something the
system does not have, add it to the system.

The exception is **domain and category colours**, which are user data — an
arbitrary `#RRGGBB` the user picked in Pengaturan (D-074). Those arrive as
inline `style` on `<DomainDot>` and nowhere else. The system palette is
deliberately low-chroma so that those dots out-saturate it.

**One amendment, from measuring rather than changing anything.** `primary` is
chroma 0.230 (light) / 0.158 (dark); the domain swatches run 0.022–0.097. So
the primary *is* louder than user data — the only token that is, and it always
has been: `indigo-600` was in the original mockup. The rule held in spirit
because `primary` appears **once per view and never inside a list**, so it
never competes with the dots row by row. Every other token stays below the
swatches. If a `PageHeader` action above a tagged list ever reads as shouting
over the dots beneath it, drop `primary`'s chroma rather than inventing a
quieter variant.

---

## 3. Tokens

Geist, `indigo-600` accent and a grey ink scale, from the Figma mockup. Light
values on `:root`, dark on `.dark`, mapped into Tailwind via `@theme inline`.

Colours are **`oklch`**, not hex. The first number is perceptual lightness, so
the contrast targets below are legible directly in the value — in hex they were
invisible, and the dark palette drifted below AA twice before anyone measured
it. `oklch` is also what shadcn presets ship in, which makes the next one a
re-solve rather than a translation.

### Colour

| Token | Role |
|---|---|
| `surface` / `surface-fg` | The page. |
| `card` / `card-fg` | Panels, list rows, the editor. |
| `popover` / `popover-fg` | Dialogs, menus. |
| `primary` / `primary-fg` | The one action a screen wants, **as a fill**. One per view. |
| `primary-ink` | The same accent drawn *on* a surface: link text, `border-primary-ink`, the timer arc. |
| `accent` / `accent-fg` | Selected/active: current nav item, open note, callouts. |
| `secondary` / `secondary-fg` | Outline buttons — the border carries them. |
| `muted` / `muted-fg` | Quiet fills and secondary text. |
| `subtle-fg` | Timestamps, counts, metadata. The quietest text. |
| `reading-fg` | Note bodies. Softer than headings on purpose. |
| `border` / `input` / `ring` | Lines and focus. |
| `focus` / `focus-fg` / `focus-muted-fg` | The focus-session surface. |
| `destructive` / `destructive-fg` / `destructive-muted` | **Deleting data only.** |

**Why `primary` splits in two.** On a white page one indigo does both jobs —
`#4f46e5` is 6.3:1 under a white label *and* 6.3:1 as link text. On a dark page
no single value can be, and the arithmetic is worth keeping because it settles
the argument every time it comes back:

- readable as text on `card` → luminance **≥ 0.220**
- readable under a white label → luminance **≤ 0.183**

So dark gets a darker fill (white label, 5.1:1) and a lighter ink (text on
card, 5.8:1). In light mode the two tokens hold the same value, which is the
honest way to say the split only exists where it is forced.

**Which one a component wants is not about the CSS property.** Anything drawn
*on* a surface takes `primary-ink` — that includes `border-` and `stroke-`, not
just `text-`, because a border on a card is a mark on a surface exactly like a
letter is. `bg-primary` is the only fill. The one exception is `Checkbox`, whose
border matches its own fill rather than the page.

Two absences are deliberate:

- **There is no `success` token and no green.** Nothing in this product is a
  pass. Finishing a review is not an achievement to celebrate; it is Tuesday.
- **There is no `warning` token and no amber.** Nothing here warns you.

`focus` is dark on a light page and *light* on a dark page — it is the surface
that makes the rest of the app step back, which is a relationship, not a colour.

### Type

Geist Variable, self-hosted via `@fontsource-variable/geist` (no CDN, D-041).
Geist Mono for card syntax and code.

| Use | Class |
|---|---|
| Page title | `text-2xl font-bold tracking-tight` |
| Card title | `text-base font-semibold` |
| UI text | `text-sm` |
| Secondary | `text-sm text-muted-fg` |
| Metadata | `text-xs text-subtle-fg` |
| **Note bodies** | `text-reading text-reading-fg` — 17px / 1.7 |

`text-reading` exists because hard rule 7 is about protecting capture, and rule
5 is about actually reading what you captured. Prose set at UI size is prose you
skim.

### Radius, elevation, motion

`rounded-sm` chips · `rounded-md` buttons, inputs, nav items · `rounded-lg`
cards · `rounded-xl` dialogs.

**Border-first.** A panel is a border, not a shadow. `shadow-float` and
`shadow-dialog` are only for things that genuinely float.

`--ease-quiet` with 120ms/200ms durations. Nothing bounces, nothing celebrates,
and `prefers-reduced-motion` is honoured in the base layer.

### Layout

`--spacing-sidebar` (260px) · `--spacing-gutter` (40px) ·
`--spacing-reading-measure` (46rem max line length).

---

## 4. Components

In `web/src/components/ui/`. shadcn/ui was used as a **source of vetted
component code, not a dependency** — the files are ours, restyled against the
tokens above. Radix is pulled in only where behaviour is genuinely hard to get
right: `Dialog` (focus trap, focus restore, scroll lock, Escape, `aria-modal`),
`DropdownMenu` (roving focus, typeahead), `Popover` (a dismissable layer that
does *not* own typeahead, which is why the searchable multi-select is built on
it and not on the menu), `Slot`, and `Switch`. Everything else is markup.

| Component | Notes |
|---|---|
| `Button` | `primary` `secondary` `ghost` `accent` `link` `destructive`; `sm/md/lg/icon/inline`; `asChild` for `<Link>`. |
| `Input` `Textarea` `Label` | Native elements. No Radix Label — every control here is native. `Textarea` has a `plain` variant for writing surfaces: no border, no fill, **no focus ring** — see below. |
| `Card` + `Header/Title/Description/Content/Footer` | |
| `ToggleGroup` / `ToggleGroupItem` | Pick one from a short, always-visible set: editor mode, timer duration, domain. |
| `Badge` `DomainDot` `DomainBadge` | |
| `Dialog` + parts | Radix. `DialogTitle` is required for a11y. |
| `ConfirmDialog` | "Are you sure?" for an action that removes data, built on `Dialog`. The description says **where the thing goes**, not that it is gone — deleting a note or a card is soft, and an alarming prompt for a reversible action is both punitive (§5) and how people learn to click through the prompts that matter. Cancel stays `secondary` so the pair does not read as a threat. |
| `Checkbox` | A native `<input type="checkbox">` under a styled box, **not Radix** — a checkbox has no focus management, typeahead or layering to get wrong, which is the bar for pulling a primitive in. `indeterminate` is a DOM property, so it is set through a ref. |
| `SelectionBar` + `SelectCheckbox` + `useSelection` | Ticking rows on the note and card lists. The bar sits **in the flow above the list**, not fixed to the viewport: a floating bar covers the last row of the list it is acting on, and on a phone it lands on the bottom nav. `SelectCheckbox` is a *sibling* of the row's button, never inside it — a `<button>` cannot legally contain a control. The selection deliberately does **not** live in the URL the way `?view=` and `?q=` do: a filter is worth reloading into, a half-made selection of things you were about to delete is not. |
| `DropdownMenu` + parts | Radix. Roving focus, typeahead, Escape. |
| `Avatar` | Initials from the email — there is no name or photo in the data model. |
| `Switch` `Separator` | |
| `Loading` | Always paired with text. |
| `Notice` | Replaces the repeated `bg-slate-100` message box. `neutral` by default. |
| `EmptyState` | See below. |
| `PageHeader` | `title`, `description`, `meta`, `actions`. Only one action may be `primary`. |
| `Markdown` `MarkdownInline` | `react-markdown` + `remark-gfm`, every element mapped to tokens by hand. **Never `innerHTML`, never `rehype-raw`** — an agent writes notes via MCP in v0.3, so embedded HTML would be a standing XSS (D-018). No typography plugin: it ships its own colour and spacing scale, which is a second source of truth. |
| `CategoryChip` `CategoryChips` `CategoryPicker` | Shared labels for notes and cards (D-055). **Colour as a dot, never as a fill** (D-074) — a tinted chip beside a domain badge is the confetti D-054 rejected, so the chip stays a neutral outline and wears the same 10px mark a domain does. The picker creates on type, because being sent elsewhere to define a label first is the friction that stops things being captured (hard rule 7). |
| `ColorPicker` | Six muted swatches plus a free `#RRGGBB` field. Shared by the domain and category editors — one row, so the two cannot drift. |
| `ViewToggle` + `useViewMode` | Grid or list for the notes and cards indexes, and **the only control over their layout** (D-078). List splits the page and previews beside it; grid takes the full width and previews in a modal. State lives in `?view=` beside `?q=`, with `localStorage` only as a fallback, so a filtered grid is a link you can reload into. |
| `ListDetail` + `DetailPlaceholder` | The index layout: list beside preview at `lg`, swapping to one or the other below it. The list column is 28rem and the preview takes the rest. Both branches wrap the list in an `@container` — the list sizes itself against its own box, so without one `@md:grid-cols-2` matches nothing and a full-width grid silently collapses to one column. |
| `NoteItem` / `CardItem` | One item, both views. **Not two components** — a tile for the grid and a row for the list is how the two drift, and they did: the tile grew a stretched click target and pointer-transparent content while the row kept a button covering only part of itself, so selecting in one looked nothing like selecting in the other. `layout` changes the axis and nothing else. A row puts the checkbox at its leading edge and the date at the far one; a cell has no leading edge, so the checkbox joins the meta line. The second line is dropped entirely when there is no domain and no category, which is the common case for a card. The stretched button is named by the item's own title or prompt — five hundred buttons called "Buka kartu" is a list you cannot navigate. |
| `MultiSelect` + `FilterBar` | Filter by several domains and several categories, searching to find them (D-078). **Popover, not DropdownMenu**: a Radix menu owns typeahead, so a text input inside one loses its keystrokes to the menu, and searching is the whole interaction. OR within a group, AND between them. Archived labels are not offered but stay visible while selected, so a link that filters by one keeps working instead of leaving the trigger lying about the list underneath. |
| `PeekPanel` + `lib/peek-route` | Preview one item from the list it came from — `side` or `center`, chosen by the view toggle rather than by a preference of its own. **The peek is a URL**, not component state: opening one navigates to `/notes/:id` and carries the list's location in history state, so App renders the main routes against *that* while the index renders the preview against the real one. Back closes it, the link is copyable, and a URL opened cold has no history state so it falls through to the full-page editor — which is right, since a peek only means something over a list you were already on. Opening a second row replaces rather than pushes, so Back returns to the list, not through every preview. **Side is deliberately not a modal**: no overlay, no focus trap, no scroll lock, so the list stays live and clicking another row swaps it instead of dismissing it. It has no close button and no Escape, because `useAutoSelect` opens the top row on arrival and there is no empty state to close to. Center *does* cover the list, so it gets Radix Dialog and keeps a close button. |
| `PropertyBar` `PropertyRow` `DomainProperty` `CategoryProperty` | An item's domain and categories, **above its title**. Borderless, label in subtle grey, edges only on hover: a row of boxed form fields above a title reads as a form you must complete before you are allowed to write, which is the friction hard rule 7 exists to remove. `CategoryProperty` expands its picker inline rather than inside a dropdown — Radix menus own typeahead, and typing is the whole interaction. |

### Adding one

1. Check `/design` first — it probably exists.
2. If the design comes from Figma, take the geometry, not the mechanics
   (§5).
3. Tokens only. If you need a new colour, it goes in `theme.css` with a role
   name and a comment saying why.
4. Add it to `StyleGuide.tsx`. A component not on that page will be
   reimplemented by the next person who needs it.

---

## 5. Never punitive, in components

Hard rule 6 is a constraint on the *system*, not a thing to remember per screen.
Where it is encoded:

- **`destructive` is for deleting data.** Deleting a note, deleting a domain.
  Never a review outcome, never a missed day, never an exam result, never an
  empty state. `Button`'s variant comment says so at the call site.
- **The two SRS answers are `secondary` and `primary`.** "Belum ingat" carries
  no red and no warning tone. Forgetting is the case the entire scheduler is
  built around — see `ReviewPage.tsx` and D-054.
- **`EmptyState` states a fact and offers the next action.** It never counts
  what was missed, never implies falling behind, and has no disappointed
  illustration. "Belum ada catatan", not "You haven't written anything yet!".
- **`Notice` defaults to neutral.** Server errors are already user-facing
  Indonesian from `writeError`; they are information, not a telling-off.
- **No progress bar toward a daily quota exists**, because no daily quota
  exists (D-009).
- **Deleting says where the thing went.** "Dipindahkan ke Terhapus" with an
  "Urungkan" beside it, not "permanently deleted" and not a countdown to catch.
  Both notes and cards soft-delete, so the honest copy is also the calm one —
  and the undo notice is a shortcut to the Terhapus view, never the only way
  back.

If a design asks for a colour this palette does not have, that is usually the
palette catching a mechanic the product rejected — check `DECISIONS.md` before
adding the token.

---

## 6. Page shape

Every authenticated screen sits inside the same shell:

- **Sidebar** (desktop) — the six destinations, plus Pengaturan below a divider.
  **Collapsible** to a 64px icon rail via the toggle at the left of the top bar;
  the state persists in `localStorage`. Collapsed, each link takes its
  accessible name from `title`/`aria-label` and the due count moves onto the
  icon. **Bottom nav** on phones; Pengaturan is not there, it lives in the
  account menu.
- **Top bar** — sidebar toggle, breadcrumb, note search, the focus pill when a
  session is running, the account menu. It is on every screen, which is why
  `PageHeader` carries no breadcrumb of its own.
- **`PageHeader`** — the first thing in the page body, always.

**Breadcrumbs** come from the `TRAIL` table in `layout/Nav.tsx`, not from URL
segments — Domain sits under Pengaturan in the trail but lives at `/domains`,
and an attempt is a child of Ujian without `/exams` in its path. Add a route
there when you add a page.

**Width.** The content area is **full width**; the gutter is the only thing
between a page and the edge. Any narrower measure is the page's own decision.
Two kinds of exception:

- **Prose** keeps a measure — `max-w-reading-measure` on note bodies,
  `max-w-prose` on `PageHeader` descriptions. Line length is a legibility
  constraint, not a layout preference.
- **The two focus flows** — reviewing and sitting an exam — are centred at
  `mx-auto max-w-2xl`, because there is exactly one thing to look at.

Everything else (Beranda, Catatan, Kartu, Ujian, Pengaturan, Domain) fills.

---

## 6b. The one place the focus ring is removed

`theme.css` sets a single `:focus-visible` outline everywhere and says never to
remove it. That still holds — with exactly one exception, `Textarea`'s `plain`
variant, used for the note body and a card's two sides.

A 2px outline drawn around a 34rem writing area is not a focus indicator; it is
a box you are typing inside, and it fights everything else about the palette.
The exception is safe **only because a text area has a blinking caret**: focus
stays unambiguous without the ring. It must never be copied onto a button, a
link, or anything with no caret of its own — those have no second indicator and
would simply become unusable by keyboard.

If you find yourself reaching for `focus-visible:outline-none` anywhere else,
the answer is no.

---

## 7. Dark mode

Both palettes are authored. `.dark` on `<html>` switches them; the class-based
`@custom-variant` means the toggle beats the OS preference rather than fighting
it.

The control is in **Pengaturan → Tampilan**: terang, gelap, or follow the
system. It is stored in `localStorage`, not on the account — there is still no
per-user settings table (the open question in `DECISIONS.md`), and a theme was
the wrong reason to add one. Storing it client-side also means the choice
applies before first paint, which a server round-trip could not do.

Any new component must look right in both. `/design` has its own local toggle,
which is where you check.

**Dark is authored against measured contrast, not by darkening the light
scale.** The first version was, and it shipped metadata at 3.6:1 (below AA at
12px), borders at 1.21:1 in a border-first system, a selected-row tint at
1.11:1 that did not render at all, and a delete button whose own white label
failed. Those are the numbers a new token has to clear:

| Role | Target against its background |
|---|---|
| Headings (`surface-fg`, `card-fg`) | 14–16:1. **Not more** — pure white on near-black is the halation that makes dark mode tiring, and light text optically gains weight, so it needs *less* contrast than dark-on-light, not more. |
| Prose (`reading-fg`) | ~10–11:1, below headings |
| Secondary (`muted-fg`) | ≥ 7:1 |
| Metadata (`subtle-fg`) | ≥ 4.5:1 — it is 12px, so it is the *hardest* text in the app, not the least important |
| Borders | ≥ 1.6:1 for panel edges, ≥ 2:1 for controls |
| Any fill under a label | ≥ 4.5:1 for the label itself |

**The dark neutrals are warm and the light ones are cool.** That divergence is
deliberate, not drift: a cool dark page reads clinical, and dark mode is the one
this product is most often *read* on.

**Warm here means mauve-slate, not brown.** The dark neutrals sit at hue 292,
chroma 0.006–0.016 — about 15° *warm of* the indigo accent at 277, not on it.
The offset is the point, and both ways past it were tried and rejected:

- Tinted **to 277**, matching the accent exactly, they become a blue-grey. That
  is where this palette started, and it reads clinical — wrong for the surface
  the product exists to be read on.
- Pushed to a **brown-warm** grey, they sit near-opposite indigo on the wheel.
  The accent stops belonging to the palette and starts sitting on top of it.

So: **when an accent clashes with its neutrals, move the neutrals — but land
near the accent's hue, not on it.** The accent itself cannot move far, because
amber reads as a warning and there is no warning here (§3), and clay or rose
lands on top of `destructive`, which is reserved for deleting data.

**A magenta preset was fitted here and rejected on comfort.** Worth recording
why, because the obvious lever was the wrong one: indigo is *more* saturated
than the magenta it replaced — chroma 0.230 against 0.190. Magenta and pink
read as high-energy at any chroma. That is a hue property, so desaturating does
not fix it and only produces a muddy accent.

### Taking a shadcn preset

The hue came from one. **The values did not, and should not.** That preset's
`.dark` block measures:

| | Preset | Required |
|---|---|---|
| body text on background | 18.9:1 | 14–16 |
| card vs background | 1.13:1 | separation |
| selected state vs card | 1.15:1 | ≥1.3 |
| white on `destructive` | 2.9:1 | ≥4.5 |
| **`primary` as text** | **2.1:1** | ≥4.5 |

The last one is the trap: shadcn's dark `primary` is a *dark* magenta meant
only as a fill under a light label, and `text-primary` is a link in three
places here — so the pair is inverted (light fill, dark ink) as described
above. Its `--accent` is a neutral grey, too, because in shadcn `accent` means
the hover fill while here it means the **selected note**; pasting it in
re-breaks selection visibility.

Presets also carry tokens this product has no use for. `--chart-1..5` are
dropped: there are no charts, and D-066 rules out the cross-account aggregation
they would draw. `--sidebar-*` are dropped: the sidebar is built from `surface`
and `card`. That is thirteen tokens nothing would ever read.

**So: take the hue, re-solve the values.** `oklch` makes that a solve rather
than a guess — fix hue and chroma, then find the L that lands each role on its
target below.

Two structural rules fall out of it. **`secondary`, `muted` and `border` must be
three different values** — they were all `#1f2937`, so a quiet fill and a
dividing line were the same colour. And **`primary` carries a dark label in
dark mode**: no single indigo is both readable as text on `card` and readable
under white as a fill, so the label flips rather than the role splitting in two.

Elevation is per-theme (`--elevation-float` / `--elevation-dialog`). A drop
shadow cast onto a near-black page moves nothing, so in dark the ladder is
carried by the fill — `popover` above `card` above `surface` — plus a hairline
on the top edge, with the shadow only darkening the ground beneath.

---

## 8. Copy

Hard rule 8: **user-facing copy is Bahasa Indonesia**, code and comments are
English. That includes `aria-label`s and placeholder text — they are read by
users. The style guide's own section headings are English; it is a dev tool.
