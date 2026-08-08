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

The exception is **domain colours**, which are user data — an arbitrary
`#RRGGBB` the user picked in the domains UI. Those arrive as inline `style` on
`<DomainDot>` and nowhere else. The system palette is deliberately low-chroma so
that those dots are the most saturated thing on any screen.

---

## 3. Tokens

Derived from the Figma mockup: Geist, `indigo-600` accent, a grey ink scale.
Light values on `:root`, dark on `.dark`, mapped into Tailwind via
`@theme inline`.

### Colour

| Token | Role |
|---|---|
| `surface` / `surface-fg` | The page. |
| `card` / `card-fg` | Panels, list rows, the editor. |
| `popover` / `popover-fg` | Dialogs, menus. |
| `primary` / `primary-fg` | The one action a screen wants. **One per view.** |
| `accent` / `accent-fg` | Selected/active: current nav item, open note, callouts. |
| `secondary` / `secondary-fg` | Outline buttons — the border carries them. |
| `muted` / `muted-fg` | Quiet fills and secondary text. |
| `subtle-fg` | Timestamps, counts, metadata. The quietest text. |
| `reading-fg` | Note bodies. Softer than headings on purpose. |
| `border` / `input` / `ring` | Lines and focus. |
| `focus` / `focus-fg` / `focus-muted-fg` | The focus-session surface. |
| `destructive` / `destructive-fg` / `destructive-muted` | **Deleting data only.** |

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
right: `Dialog` (focus trap, focus restore, scroll lock, Escape, `aria-modal`)
and `Switch`. Everything else is markup.

| Component | Notes |
|---|---|
| `Button` | `primary` `secondary` `ghost` `accent` `link` `destructive`; `sm/md/lg/icon/inline`; `asChild` for `<Link>`. |
| `Input` `Textarea` `Label` | Native elements. No Radix Label — every control here is native. |
| `Card` + `Header/Title/Description/Content/Footer` | |
| `ToggleGroup` / `ToggleGroupItem` | Pick one from a short, always-visible set: editor mode, timer duration, domain. |
| `Badge` `DomainDot` `DomainBadge` | |
| `Dialog` + parts | Radix. `DialogTitle` is required for a11y. |
| `DropdownMenu` + parts | Radix. Roving focus, typeahead, Escape. |
| `Avatar` | Initials from the email — there is no name or photo in the data model. |
| `Switch` `Separator` | |
| `Loading` | Always paired with text. |
| `Notice` | Replaces the repeated `bg-slate-100` message box. `neutral` by default. |
| `EmptyState` | See below. |
| `PageHeader` | `title`, `description`, `meta`, `actions`. Only one action may be `primary`. |
| `Markdown` `MarkdownInline` | `react-markdown` + `remark-gfm`, every element mapped to tokens by hand. **Never `innerHTML`, never `rehype-raw`** — an agent writes notes via MCP in v0.3, so embedded HTML would be a standing XSS (D-018). No typography plugin: it ships its own colour and spacing scale, which is a second source of truth. |
| `CategoryChip` `CategoryChips` `CategoryPicker` | Shared labels for notes and cards (D-055). **No colour** — domain colour is the one colour signal in a row, and a second palette competing with it turns a list into confetti. The picker creates on type, because being sent elsewhere to define a label first is the friction that stops things being captured (hard rule 7). |
| `ViewToggle` + `useViewMode` | Grid or list for the notes and cards indexes. State lives in `?view=` beside `?q=`, with `localStorage` only as a fallback, so a filtered grid is a link you can reload into. |
| `DetailsDrawer` `DetailsDrawerTrigger` `DetailsField` | Metadata beside a note or card. A static column at `lg`+ and a real Radix dialog below it — **not one component styled two ways**: rendering both and hiding one would put every field in the DOM twice and break label association. The caller passes `docked` from `useMediaQuery`. |

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

---

## 8. Copy

Hard rule 8: **user-facing copy is Bahasa Indonesia**, code and comments are
English. That includes `aria-label`s and placeholder text — they are read by
users. The style guide's own section headings are English; it is a dev tool.
