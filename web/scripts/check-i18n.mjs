/*
 * User-facing copy does not live in a feature folder.
 *
 * Hard rule 8 as amended by D-094: every string a person reads ships in
 * Indonesian *and* English, out of `web/src/i18n/`. The `Copy` type is what
 * makes a missing translation a compile error; this is the other half (hard
 * rule 9) — the thing that notices a sentence typed straight into JSX, which
 * the type system cannot see because it was never a key.
 *
 * Run it with `make check-i18n`, or `npm run check:i18n` from `web/`.
 * `--update` rewrites the baseline described below.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IT CATCHES
 *
 *   - JSX text:            <p>Sesi berakhir.</p>
 *   - JSX expressions:     {isPending ? 'Sebentar…' : 'Keluarkan'}
 *   - JSX attributes:      <Input placeholder="Judul catatan" />
 *   - object literals:     const THEMES = [{ label: 'Terang' }]
 *   - template literals:   `${browser} di ${platform}`
 *
 * in every `.ts` and `.tsx` file under `web/src/features/` and
 * `web/src/components/`, plus `web/src/App.tsx`.
 *
 * WHAT IT DELIBERATELY DOES NOT CATCH
 *
 * A check that cries wolf gets switched off, so the rules below err towards
 * silence. Each of these is a decision, not an oversight:
 *
 *   - Class names, in an attribute or inside `cn()`/`clsx()`/`cva()`.
 *   - Anything in an attribute that is never copy — `className`, `id`, `key`,
 *     `href`, `to`, `type`, `name`, `value`, `role`, `variant`, `size`,
 *     `data-*`, and the aria attributes that take an id rather than a phrase
 *     (`aria-labelledby`, `aria-controls`, `aria-hidden`, …). `aria-label`,
 *     `alt`, `title`, `placeholder` and `description` ARE copy and are checked.
 *   - Test ids, query keys, URLs, paths, MIME types, header names, HTTP verbs,
 *     storage keys, CSS values, and anything else shaped like an identifier
 *     rather than a sentence.
 *   - Import specifiers, literal types (`type Theme = 'dark'`), `case` labels,
 *     property *names*, and arguments to `console.*`.
 *   - `*.test.ts`/`*.test.tsx`, which assert on Indonesian copy on purpose.
 *   - Punctuation and separators with no letters in them: `·`, `—`, `&middot;`.
 *
 * KNOWN BLIND SPOTS, stated so nobody trusts this further than it goes:
 *
 *   - A single all-lower-case word (`'kemarin'`, `'batal'`) is indistinguishable
 *     from an identifier and is NOT flagged. A capitalised one (`'Batal'`) is.
 *   - An ALL-CAPS word is read as a constant and is NOT flagged.
 *   - A single hyphenated token (`'e-mail'`) is read as a CSS/HTTP value.
 *
 * Several strings in the shared component layer were found by people reading
 * code rather than by this script, and two whole classes of them were invisible
 * to it for a reason worth stating: a **default parameter**
 * (`label = 'Memuat…'`) does not read as copy in a diff, and a string a
 * component *assembles* (`` `${remaining} ${noun} lagi` ``) can be half
 * translated and half not while every literal in sight is in the catalog. This
 * finds the first now that `components/` is in scope. Nothing finds the second.
 *
 * WHAT IS STILL OUT OF SCOPE, and why each one
 *
 *   - `web/src/i18n/` — the catalogs. Copy is what they are for.
 *   - `web/src/design/StyleGuide.tsx` — the living style guide at `/design`,
 *     which `main.tsx` builds only under `import.meta.env.DEV` and Rollup drops
 *     from the production bundle entirely. It is developer documentation about
 *     tokens and components; nobody but us reads it, and translating it would
 *     be work with no reader.
 *   - `web/src/lib/` and `web/src/api/` — one genuine string between them,
 *     `client.ts`'s fallback error message, which is user-facing and is a real
 *     gap. It is not a component and cannot call `useCopy()`; closing it means
 *     threading `Copy` into the fetch layer, which is its own change. Left
 *     named here rather than quietly widened past.
 *
 * THE ESCAPE HATCH
 *
 * A proper noun is not copy. `Chrome`, `macOS`, `Postgres` and `Obsidian` are
 * the same word in both languages and belong in the code that produces them.
 * Mark them:
 *
 *     const label = 'Firefox' // i18n-exempt: browser name, not copy
 *
 *     // i18n-exempt: platform names are proper nouns
 *     function describeClient(ua) { … }        ← the whole function is exempt
 *
 * A trailing marker exempts its own line. A marker on its own line exempts the
 * next declaration or statement in full. Write the reason — an exemption
 * without one is indistinguishable from giving up.
 *
 * THE BASELINE
 *
 * 58 feature files were written before this existed. `i18n-baseline.json`
 * records how many literals each still has, and the check is a ratchet: a new
 * file with literals fails, a file that gains one fails, and a file that
 * reaches zero fails until it is removed from the baseline — which is what
 * stops a converted file from keeping its exemption forever. A file that
 * merely improves passes and says so.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * Where copy is not allowed to live.
 *
 * `features/` was the whole of it while `11` I5's six agents were converting
 * six feature folders in parallel; `components/` and `App.tsx` joined it once
 * the shared layer was converted, which is what I1 said this line was waiting
 * for. Widening it matters more than it looks: with only `features/` in scope
 * the baseline could reach zero — and did — while every screen still rendered
 * Indonesian, because the components every screen is built from were never
 * counted. Paths are relative to `src/`, so a report says which of them a file
 * came from.
 */
const ROOT = join(WEB, 'src')
const SCAN = ['features', 'components', 'App.tsx'].map((p) => join(ROOT, p))
const BASELINE = join(WEB, 'i18n-baseline.json')

const UPDATE = process.argv.includes('--update')
/** `--list [substring]` prints everything still untranslated. For I5's sweep. */
const LIST = process.argv.includes('--list')
const FILTER = process.argv.slice(2).find((a) => !a.startsWith('-'))

/* ── What is never copy ──────────────────────────────────────────────────── */

/** JSX attributes that never hold a sentence. */
const NEVER_COPY_ATTRS = new Set([
  'className', 'class', 'id', 'key', 'ref', 'style', 'href', 'to', 'src', 'srcSet',
  'type', 'name', 'value', 'defaultValue', 'role', 'variant', 'size', 'color',
  'width', 'height', 'target', 'rel', 'method', 'action', 'htmlFor', 'form',
  'pattern', 'autoComplete', 'inputMode', 'enterKeyHint', 'dir', 'lang', 'slot',
  'viewBox', 'fill', 'stroke', 'xmlns', 'd', 'testId', 'as', 'side', 'align',
  'aria-hidden', 'aria-controls', 'aria-labelledby', 'aria-describedby',
  'aria-owns', 'aria-current', 'aria-live', 'aria-relevant', 'aria-haspopup',
  'aria-expanded', 'aria-selected', 'aria-checked',
])

/** Object properties that never hold a sentence. */
const NEVER_COPY_PROPS = new Set([
  'className', 'class', 'id', 'key', 'path', 'to', 'href', 'url', 'endpoint',
  'method', 'queryKey', 'mutationKey', 'testId', 'variant', 'size', 'color',
  'icon', 'value', 'name', 'type', 'locale', 'tag', 'slug', 'event', 'code',
  'field', 'kind', 'format', 'mode', 'credentials',
])

/**
 * Properties whose value is a DOM enum rather than a sentence. A string
 * compared against one of these is `'Enter'`, `'INPUT'`, `'ArrowDown'` — never
 * something a person reads.
 */
const DOM_ENUM_PROPS = new Set(['key', 'code', 'tagName', 'nodeName', 'type'])

/** Constructors whose arguments are never copy. */
const NEVER_COPY_NEW = new Set(['URL', 'URLSearchParams', 'Error', 'TypeError', 'RangeError'])

/** Calls whose arguments are never copy. Matched on the last name segment. */
const NEVER_COPY_CALLS = new Set([
  'cn', 'clsx', 'cva', 'twMerge', 'require', 'import', 'Symbol',
  'log', 'warn', 'error', 'debug', 'info', 'trace',
  'getItem', 'setItem', 'removeItem', 'matchMedia', 'querySelector',
  'querySelectorAll', 'getElementById', 'createElement',
  'addEventListener', 'removeEventListener',
])

/* ── Is this string prose? ───────────────────────────────────────────────── */

const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/
const CONSTANT = /^[A-Z0-9_]+$/
const TOKEN_PATH = /^[A-Za-z0-9]+([-_./:][A-Za-z0-9]+)+$/
const CLASS_TOKEN = /^[a-z0-9!:[\]/.%_()#,*+-]+$/
const CLASSY = /[-:[/]/

function looksLikeClassList(s) {
  const tokens = s.split(' ')
  if (tokens.length < 2) return false
  // Every token lower-case utility-shaped, and at least one carrying the
  // punctuation Tailwind uses. Without the second half, "baru saja" is a
  // class list.
  return tokens.every((t) => CLASS_TOKEN.test(t)) && tokens.some((t) => CLASSY.test(t))
}

function isProse(raw) {
  const s = raw.replace(/\s+/g, ' ').trim()

  if (s.length < 2) return false
  if (!/[A-Za-z]/.test(s)) return false
  if (/^[.#/@?$]/.test(s) || s.includes('://')) return false
  if (IDENTIFIER.test(s)) return false
  if (CONSTANT.test(s)) return false
  if (TOKEN_PATH.test(s)) return false
  if (looksLikeClassList(s)) return false

  // Prose is a phrase, a capitalised word, or something carrying typographic
  // punctuation this codebase only uses in copy.
  return s.includes(' ') || /^[A-Z][a-z]/.test(s) || /[…—]/.test(s)
}

/* ── Where a literal sits ────────────────────────────────────────────────── */

function attrName(node) {
  return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
    ? node.name.text
    : node.name.getText()
}

function calleeTail(call) {
  const text = call.expression.getText()
  return text.split('.').pop()
}

/**
 * True when the literal's position says it cannot be copy, whatever it says.
 * Walks outwards, because the innermost node rarely knows: a string inside a
 * ternary inside `cn()` inside `className` is three levels from its answer.
 */
function inNonCopyPosition(node) {
  let child = node
  let parent = node.parent

  while (parent) {
    if (
      ts.isImportDeclaration(parent) ||
      ts.isExportDeclaration(parent) ||
      ts.isImportTypeNode(parent) ||
      ts.isModuleDeclaration(parent) ||
      ts.isLiteralTypeNode(parent) ||
      ts.isComputedPropertyName(parent)
    ) {
      return true
    }

    if (ts.isJsxAttribute(parent)) {
      const name = attrName(parent)
      return NEVER_COPY_ATTRS.has(name) || name.startsWith('data-')
    }

    if (ts.isPropertyAssignment(parent)) {
      // The key itself is never copy; the value might be.
      if (child === parent.name) return true
      const name = ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)
        ? parent.name.text
        : parent.name.getText()
      if (NEVER_COPY_PROPS.has(name) || name.startsWith('data-')) return true
    }

    if (ts.isCallExpression(parent) && child !== parent.expression) {
      if (NEVER_COPY_CALLS.has(calleeTail(parent))) return true
    }

    // `new URL('/api/…')` is a path; `new Error('useTheme must be used inside
    // <ThemeProvider>')` is a message for whoever wired the component wrong.
    // Nothing in this app throws a hand-built Error at a user: a failure they
    // read arrives as the API's error shape, or from a zod schema, and both
    // are checked because neither is a `new Error`.
    if (ts.isNewExpression(parent) && child !== parent.expression) {
      if (NEVER_COPY_NEW.has(parent.expression.getText())) return true
    }

    if (ts.isCaseClause(parent) && child === parent.expression) return true

    // `e.key === 'Enter'`, `e.code === 'Escape'`, `target.tagName === 'INPUT'`.
    // A DOM enum value, and one that recurs — every keyboard handler in the app
    // has one. Capitalised and therefore prose by every other test here, which
    // would leave the escape hatch as the only answer and put an exemption
    // comment on each of them for a reason that is the same reason every time.
    if (ts.isBinaryExpression(parent) && child !== parent.operatorToken) {
      const other = child === parent.left ? parent.right : parent.left
      if (ts.isPropertyAccessExpression(other) && DOM_ENUM_PROPS.has(other.name.text)) {
        return true
      }
    }

    if (ts.isElementAccessExpression(parent) && child === parent.argumentExpression) {
      return true
    }

    child = parent
    parent = parent.parent
  }

  return false
}

/* ── The i18n-exempt markers ─────────────────────────────────────────────── */

/**
 * Ranges of the file the marker turns off.
 *
 * A marker with code before it on its line covers that line. A marker alone on
 * its line covers the next thing the parser produced — the declaration or
 * statement it was written above.
 */
function exemptRanges(sourceFile, text) {
  const ranges = []
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.JSX,
    text,
  )

  const starts = []
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      if (scanner.getTokenText().includes('i18n-exempt')) {
        starts.push({ start: scanner.getTokenStart(), end: scanner.getTokenEnd() })
      }
    }
    token = scanner.scan()
  }

  if (starts.length === 0) return ranges

  // Every node start, so "the next declaration" is answerable.
  const nodes = []
  const collect = (node) => {
    nodes.push(node)
    ts.forEachChild(node, collect)
  }
  ts.forEachChild(sourceFile, collect)

  const lines = sourceFile.getLineStarts()

  for (const { start, end } of starts) {
    const line = sourceFile.getLineAndCharacterOfPosition(start).line
    const lineStart = lines[line]
    const before = text.slice(lineStart, start)

    if (before.trim() !== '') {
      // Trailing marker: this line only.
      const lineEnd = line + 1 < lines.length ? lines[line + 1] : text.length
      ranges.push([lineStart, lineEnd])
      continue
    }

    // Own-line marker: the next node, outermost first.
    let best = null
    for (const node of nodes) {
      const nodeStart = node.getStart(sourceFile)
      if (nodeStart < end) continue
      if (!best || nodeStart < best.start || (nodeStart === best.start && node.end > best.end)) {
        best = { start: nodeStart, end: node.end }
      }
    }

    ranges.push(best ? [start, best.end] : [start, text.length])
  }

  return ranges
}

/* ── One file ────────────────────────────────────────────────────────────── */

function scanFile(path) {
  const text = readFileSync(path, 'utf8')
  // TSX only for `.tsx`. A generic arrow in a `.ts` file — `<T>(path: string)
  // => request<T>(path)` — parses as a JSX element under `ScriptKind.TSX`, and
  // the code between the brackets is then reported as JSX text.
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const exempt = exemptRanges(sourceFile, text)
  const isExempt = (pos) => exempt.some(([from, to]) => pos >= from && pos < to)

  const found = []
  const report = (pos, value) => {
    if (isExempt(pos)) return
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos)
    const shown = value.replace(/\s+/g, ' ').trim()
    found.push({
      line: line + 1,
      column: character + 1,
      text: shown.length > 60 ? `${shown.slice(0, 57)}…` : shown,
    })
  }

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (isProse(node.text)) report(node.getStart(sourceFile), node.text)
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!inNonCopyPosition(node) && isProse(node.text)) {
        report(node.getStart(sourceFile), node.text)
      }
    } else if (ts.isTemplateExpression(node)) {
      // The literal chunks around the `${}` holes. `${a} di ${b}` is copy;
      // `/api/notes/${id}` is not, and the prose test separates them.
      if (!inNonCopyPosition(node)) {
        const chunks = [node.head, ...node.templateSpans.map((s) => s.literal)]
        for (const chunk of chunks) {
          if (isProse(chunk.text)) report(chunk.getStart(sourceFile), chunk.text)
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

/* ── Walking the tree ────────────────────────────────────────────────────── */

/** A scanned file: source, not a test, not a declaration. */
function isSource(entry) {
  return (
    /\.tsx?$/.test(entry) &&
    !/\.(test|spec)\.tsx?$/.test(entry) &&
    !entry.endsWith('.d.ts')
  )
}

/** Every source file under a root, which may itself be a single file. */
function sourceFiles(root, out = []) {
  if (!statSync(root).isDirectory()) {
    if (isSource(root)) out.push(root)
    return out
  }
  for (const entry of readdirSync(root).sort()) {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out)
    } else if (isSource(entry)) {
      out.push(path)
    }
  }
  return out
}

/* ── Baseline ────────────────────────────────────────────────────────────── */

const results = new Map()
for (const root of SCAN) {
  for (const path of sourceFiles(root)) {
    const hits = scanFile(path)
    if (hits.length > 0) results.set(relative(ROOT, path).split(sep).join('/'), hits)
  }
}

if (LIST) {
  let total = 0
  for (const [file, hits] of results) {
    if (FILTER && !file.includes(FILTER)) continue
    console.log(`src/${file}`)
    for (const hit of hits) console.log(`  ${hit.line}:${hit.column}  ${JSON.stringify(hit.text)}`)
    total += hits.length
  }
  console.log(`\n${total} literals`)
  process.exit(0)
}

if (UPDATE) {
  const files = Object.fromEntries(
    [...results.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, h]) => [f, h.length]),
  )
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _note:
          'Files under src/ still holding untranslated literals, and how many. ' +
          'Written by `node scripts/check-i18n.mjs --update`. This is a ratchet: ' +
          'the numbers may fall and a file may leave, never the other way round. ' +
          'A file that reaches zero must be deleted from this list — see ticket 11 I1.',
        files,
      },
      null,
      2,
    )}\n`,
  )
  const total = Object.values(files).reduce((a, b) => a + b, 0)
  console.log(`check-i18n: baseline written — ${Object.keys(files).length} files, ${total} literals`)
  process.exit(0)
}

let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).files ?? {}
} catch {
  console.error(`check-i18n: no baseline at ${relative(WEB, BASELINE)}.`)
  console.error('Run `node scripts/check-i18n.mjs --update` to create one.')
  process.exit(1)
}

const failures = []
const improved = []

for (const [file, hits] of results) {
  const allowed = baseline[file] ?? 0
  if (hits.length > allowed) {
    failures.push({ file, allowed, hits })
  } else if (hits.length < allowed) {
    improved.push(`${file}: ${allowed} → ${hits.length}`)
  }
}

// A file that was fully converted but left in the baseline keeps an exemption
// it no longer needs, and the next literal typed into it would be free.
const finished = Object.keys(baseline)
  .filter((file) => !results.has(file))
  .sort()

if (failures.length > 0) {
  console.error('check-i18n: user-facing copy typed straight into a screen or a component.\n')
  for (const { file, allowed, hits } of failures) {
    console.error(`  src/${file}  (${hits.length} literals, baseline allows ${allowed})`)
    for (const hit of hits.slice(0, 12)) {
      console.error(`    ${hit.line}:${hit.column}  ${JSON.stringify(hit.text)}`)
    }
    if (hits.length > 12) console.error(`    … and ${hits.length - 12} more`)
    console.error('')
  }
  console.error('Copy belongs in web/src/i18n/{id,en}.ts, read through useCopy().')
  console.error('A proper noun that is the same word in both languages is exempt:')
  console.error("  const label = 'Firefox' // i18n-exempt: browser name, not copy")
  process.exit(1)
}

if (finished.length > 0) {
  console.error('check-i18n: these files are translated and still listed in i18n-baseline.json:\n')
  for (const file of finished) console.error(`  src/${file}`)
  console.error('\nRemove them, or run `npm run check:i18n -- --update`. A converted file')
  console.error('that keeps its baseline entry would accept a new literal for free.')
  process.exit(1)
}

for (const line of improved) console.log(`check-i18n: ${line}`)
const remaining = [...results.values()].reduce((a, hits) => a + hits.length, 0)
console.log(
  `check-i18n: no new literals (${results.size} files still to translate, ${remaining} literals)`,
)
