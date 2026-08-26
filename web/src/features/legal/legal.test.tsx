import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { en } from '../../i18n/legal/en'
import { id } from '../../i18n/legal/id'
import { CLAIMS, SCHEMA_COVERAGE, type ClaimId } from '../../i18n/legal/coverage'
import {
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  type Block,
  type LegalCopy,
  type LegalDocument,
  type PrivacySection,
} from '../../i18n/legal/types'
import { LocaleProvider, loadCatalog } from '../../i18n'
import { loadLegal } from '../../i18n/legal'
import PrivacyPage from './PrivacyPage'
import TermsPage from './TermsPage'
import { parseInline } from './inline'

/**
 * The policy and the terms — in both languages (07 L9, ticket 11 I4).
 *
 * L9's acceptance is that "someone who has not seen the code could read the
 * privacy policy and describe what the app stores". That is a claim about
 * coverage, and L9 tested it with a needle list: a dozen known things asserted
 * to be mentioned.
 *
 * **A needle list fails in one direction only.** It notices when a listed thing
 * goes missing. It cannot notice a new thing being stored and never documented,
 * because a new column is not on the list and nothing makes it get on the list —
 * which is the direction a privacy policy actually goes untrue. Migration 00013
 * added `users.suspended_at`, a fact about an account including whether the
 * operator has acted against it and since when, and every test stayed green.
 *
 * So the list is inverted here. `i18n/legal/coverage.ts` enumerates the schema;
 * this file reads the real columns out of `internal/store/gen/models.go` and
 * fails on any column that file does not account for. A new column is a failing
 * test until somebody writes down which part of the policy covers it, or why it
 * needs no cover.
 *
 * Everything runs against **both** languages. A claim in one and not the other
 * is two different policies, and the reader of the shorter one was never told.
 */

/* ── The schema, as the database actually has it ─────────────────────────── */

const HERE = dirname(fileURLToPath(import.meta.url))
const MODELS = join(HERE, '..', '..', '..', '..', 'internal', 'store', 'gen', 'models.go')

/**
 * Every column, read from sqlc's generated models.
 *
 * Not from the migrations. They are the truth, but reading them means replaying
 * CREATE TABLE / ADD COLUMN / DROP COLUMN / RENAME COLUMN across an up and a
 * down section in fourteen files, and a parser with a bug there sees *fewer*
 * columns than exist — silently passing, which is this test's whole failure
 * mode. sqlc has already done that replay, `make sqlc-diff` fails in CI when its
 * output drifts, and the `json:"…"` tag is the column name verbatim.
 */
function schemaColumns(): string[] {
  const src = readFileSync(MODELS, 'utf8')
  const columns: string[] = []

  for (const model of src.matchAll(/^type (\w+) struct \{([\s\S]*?)^\}/gm)) {
    const table = model[1].replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
    for (const field of model[2].matchAll(/json:"([a-z0-9_]+)"/g)) {
      columns.push(`${table}.${field[1]}`)
    }
  }

  return columns
}

/* ── Reading a document as text ──────────────────────────────────────────── */

function blockText(block: Block): string {
  return block.kind === 'p' ? block.text : block.items.join(' ')
}

function sectionText(doc: LegalDocument<string>, section: string): string {
  const found = doc.sections[section]
  return found ? [found.heading, ...found.blocks.map(blockText)].join(' ').toLowerCase() : ''
}

function documentText(doc: LegalDocument<string>): string {
  return [
    doc.title,
    doc.updated,
    ...doc.intro.map(blockText),
    ...Object.values(doc.sections).flatMap((s) => [
      (s as { heading: string }).heading,
      ...(s as { blocks: readonly Block[] }).blocks.map(blockText),
    ]),
    ...doc.outro.map(blockText),
  ]
    .join(' ')
    .toLowerCase()
}

const CATALOGS: { locale: 'id' | 'en'; copy: LegalCopy }[] = [
  { locale: 'id', copy: id },
  { locale: 'en', copy: en },
]

/* ── Coverage, driven by the schema ──────────────────────────────────────── */

describe('the privacy policy covers the schema', () => {
  const columns = schemaColumns()

  it('found the schema at all', () => {
    // A silent zero would pass every assertion below forever. If models.go ever
    // changes shape, that is a broken test rather than an empty database.
    expect(columns.length).toBeGreaterThan(100)
    expect(columns).toContain('user.suspended_at')
  })

  it('accounts for every column, with no default', () => {
    const undocumented = columns.filter((c) => !(c in SCHEMA_COVERAGE))

    expect(
      undocumented,
      'these columns exist and the privacy policy does not account for them. ' +
        'Add each to SCHEMA_COVERAGE in web/src/i18n/legal/coverage.ts: either ' +
        'a claim id the policy makes, or { exempt: "<why it says nothing about ' +
        'the person>" }.',
    ).toEqual([])
  })

  it('has no entry for a column that no longer exists', () => {
    // A stale entry is a claim the policy keeps making about data that is gone,
    // and it is also the way a column could be renamed without anyone noticing
    // that the new name is undocumented.
    const live = new Set(columns)
    const stale = Object.keys(SCHEMA_COVERAGE).filter((c) => !live.has(c))

    expect(stale, 'in coverage.ts and not in the schema').toEqual([])
  })

  it('gives every exemption a reason', () => {
    const silent = Object.entries(SCHEMA_COVERAGE)
      .filter(([, value]) => typeof value === 'object' && value.exempt.trim().length < 20)
      .map(([column]) => column)

    expect(silent, 'exempt with no reason worth reading').toEqual([])
  })

  for (const { locale, copy } of CATALOGS) {
    it(`makes every claimed thing in ${locale}, in the section that claims it`, () => {
      const missing: string[] = []

      for (const [column, coverage] of Object.entries(SCHEMA_COVERAGE)) {
        if (typeof coverage === 'object') continue

        const claim = CLAIMS[coverage as ClaimId]
        const text = sectionText(copy.privacy, claim.section)
        const needle = claim[locale].toLowerCase()
        if (!text.includes(needle)) {
          missing.push(`${column} → ${coverage}: "${needle}" not in section "${claim.section}"`)
        }
      }

      expect([...new Set(missing)]).toEqual([])
    })
  }

  it('places every claim in a section the policy actually has', () => {
    const sections = new Set<string>(PRIVACY_SECTIONS)
    const stray = Object.entries(CLAIMS)
      .filter(([, claim]) => !sections.has(claim.section))
      .map(([name, claim]) => `${name} → ${claim.section}`)

    expect(stray).toEqual([])
  })

  it('uses every claim it declares', () => {
    // An unused claim is a needle nothing points at: it can go stale, and it
    // makes the map look like it covers more than it does.
    const used = new Set(Object.values(SCHEMA_COVERAGE).filter((v) => typeof v === 'string'))
    const unused = Object.keys(CLAIMS).filter((name) => !used.has(name as never))

    expect(unused, 'declared in CLAIMS and pointed at by no column').toEqual([])
  })
})

/* ── Section parity ──────────────────────────────────────────────────────── */

describe('both languages are the same document', () => {
  // The order is shared rather than declared per language (see the tuples in
  // i18n/legal/types.ts), and the `sections` mapped type makes a missing
  // section a compile error. This is the second mechanism (hard rule 9): the
  // type is checked at build time by whoever runs the build, and a section
  // silently rendered out of order is the thing a reader cannot see.

  it('has the same privacy sections, in the same order', () => {
    expect(Object.keys(id.privacy.sections)).toEqual(Object.keys(en.privacy.sections))
    for (const section of PRIVACY_SECTIONS) {
      expect(id.privacy.sections[section], `id is missing ${section}`).toBeDefined()
      expect(en.privacy.sections[section], `en is missing ${section}`).toBeDefined()
    }
  })

  it('has the same terms sections, in the same order', () => {
    expect(Object.keys(id.terms.sections)).toEqual(Object.keys(en.terms.sections))
    for (const section of TERMS_SECTIONS) {
      expect(id.terms.sections[section], `id is missing ${section}`).toBeDefined()
      expect(en.terms.sections[section], `en is missing ${section}`).toBeDefined()
    }
  })

  it('has the same block shape in every section', () => {
    // A paragraph in one language where the other has a list is not a
    // formatting difference: a list is a set of separate claims and a paragraph
    // is one, so it is the shape a dropped claim hides in.
    const shape = (doc: LegalDocument<string>) =>
      Object.entries(doc.sections).map(
        ([name, s]) =>
          `${name}: ${(s as { blocks: readonly Block[] }).blocks
            .map((b) => (b.kind === 'p' ? 'p' : `ul/${b.items.length}`))
            .join(',')}`,
      )

    expect(shape(id.privacy)).toEqual(shape(en.privacy))
    expect(shape(id.terms)).toEqual(shape(en.terms))
    expect(id.privacy.intro.length).toBe(en.privacy.intro.length)
    expect(id.terms.intro.length).toBe(en.terms.intro.length)
  })

  it('has no empty heading or block', () => {
    for (const { locale, copy } of CATALOGS) {
      for (const doc of [copy.privacy, copy.terms]) {
        for (const [name, section] of Object.entries(doc.sections)) {
          const s = section as { heading: string; blocks: readonly Block[] }
          expect(s.heading.trim(), `${locale}: ${name} has no heading`).not.toBe('')
          expect(s.blocks.length, `${locale}: ${name} has no content`).toBeGreaterThan(0)
          for (const block of s.blocks) {
            expect(blockText(block).trim(), `${locale}: ${name} has a blank block`).not.toBe('')
          }
        }
      }
    }
  })

  it('leaves no unclosed marker', () => {
    // An odd number of `*` means one of them renders as an asterisk, and a
    // `[label]` with no target renders as brackets. Both are the kind of thing
    // nobody notices in a document nobody reads until they need it.
    for (const { locale, copy } of CATALOGS) {
      for (const doc of [copy.privacy, copy.terms]) {
        const strings = [
          ...doc.intro.map(blockText),
          ...Object.values(doc.sections).flatMap((s) =>
            (s as { blocks: readonly Block[] }).blocks.map(blockText),
          ),
          ...doc.outro.map(blockText),
        ]
        for (const line of strings) {
          expect((line.match(/\*/g) ?? []).length % 2, `${locale}: unclosed * in "${line}"`).toBe(0)
          expect(line, `${locale}: an unlinked [label] in "${line}"`).not.toMatch(/\[[^\]]+\](?!\()/)
        }
      }
    }
  })
})

/* ── Claims that are about infrastructure, not about data ────────────────── */

describe('claims with nothing behind them', () => {
  // The coverage check above fails when a new feature stores something the
  // policy does not mention. It cannot fail when a claim already on the page
  // stops being true — or was never true. That is D-092: this page said "backup
  // terenkripsi"; the platform's pipeline writes `pg_dumpall | gzip -9` and
  // ships that same file to R2 (`scripts/ship-backups.sh`), so neither copy is
  // encrypted by us. R2's at-rest encryption is the storage provider's.
  //
  // A published document making a factual claim about something we control is
  // only ever examined after something has gone wrong, which is the worst
  // moment to discover the wording was aspirational. Every such claim gets an
  // assertion of its own, in both languages.

  it.each(CATALOGS)('does not claim encrypted backups in $locale', ({ locale, copy }) => {
    const body = documentText(copy.privacy)

    expect(body).toContain('backup')
    expect(body, `${locale} claims encrypted backups`).not.toMatch(
      /backup terenkripsi|encrypted backup/,
    )
    expect(body).toContain(locale === 'id' ? 'tidak kami enkripsi' : 'not encrypted by us')
  })

  it.each(CATALOGS)('states retention, including for backups, in $locale', ({ locale, copy }) => {
    const text = sectionText(copy.privacy, 'retention')

    expect(text).toContain('30')
    expect(text).toContain(locale === 'id' ? 'backup' : 'backup')
  })

  it.each(CATALOGS)('names the third parties that receive anything in $locale', ({ copy }) => {
    // "Shared with nobody" is not literally true, and saying it would be the
    // boilerplate problem in reverse. Each processor is named with what it
    // actually receives.
    const text = sectionText(copy.privacy, 'processors')

    expect(text).toContain('resend')
    expect(text).toContain('sentry')
    expect(text).toContain('cloudflare r2')
    // And the limit on what Sentry gets, which is the part that matters.
    expect(documentText(copy.privacy)).toMatch(/id akun|account id/)
  })

  it.each(CATALOGS)('states the rights the app actually implements in $locale', ({ locale, copy }) => {
    // Export and deletion are built (07 L6, L7), so the policy can promise them
    // without qualification — and must, since a policy that omits a right the
    // product has is as wrong as one that invents a right it does not.
    const text = sectionText(copy.privacy, 'rights')

    expect(text).toContain(locale === 'id' ? 'unduh' : 'download')
    expect(text).toContain(locale === 'id' ? 'hapus akun' : 'delete account')
  })

  it.each(CATALOGS)('says the export leaves credentials out, in $locale', ({ locale, copy }) => {
    // `export.sql` omits auth_sessions and auth_tokens entirely and selects
    // explicit columns from `users` so that password_hash cannot leak into the
    // archive. A policy that said "everything" without that carve-out would be
    // describing a different export.
    const text = sectionText(copy.privacy, 'rights')

    expect(text).toContain(locale === 'id' ? 'kredensial' : 'credential')
  })

  it.each(CATALOGS)('is honest about there being no uptime guarantee in $locale', ({ locale, copy }) => {
    const text = sectionText(copy.terms, 'availability')

    expect(text).toContain(locale === 'id' ? 'apa adanya' : 'as is')
    expect(text).toContain(locale === 'id' ? 'tanpa jaminan' : 'no guarantee')
  })

  it.each(CATALOGS)('promises notice and an export window if the service closes in $locale', ({ locale, copy }) => {
    // The most basic promise this product can make, and the one its whole
    // thesis rests on: nothing disappears without warning.
    const text = sectionText(copy.terms, 'closing')

    expect(text).toContain('30')
    expect(text).toContain(locale === 'id' ? 'minimal 30 hari' : 'at least 30 days')
  })

  it.each(CATALOGS)('says the content belongs to the user in $locale', ({ locale, copy }) => {
    expect(sectionText(copy.terms, 'yourContent')).toContain(
      locale === 'id' ? 'milik kamu' : 'it is yours',
    )
  })
})

/* ── D-096: free, best-effort, exportable, leaveable, self-hostable ──────── */

describe('the terms carry D-096', () => {
  // Free is a permanent property rather than a launch price: no billing code,
  // no tier, no feature gating, ever (hard rule 12), with self-hosting as the
  // pressure valve if hosting cost outgrows the operator. All five halves of
  // that sentence are load-bearing, and each is asserted rather than assumed.

  it.each(CATALOGS)('says free is permanent, not a launch price, in $locale', ({ locale, copy }) => {
    const text = sectionText(copy.terms, 'free')

    if (locale === 'id') {
      expect(text).toContain('tidak ada paket berbayar')
      expect(text).toContain('tingkatan')
      expect(text).toContain('sekarang maupun nanti')
    } else {
      expect(text).toContain('no paid plan')
      expect(text).toContain('tiers')
      expect(text).toContain('not now and not later')
    }
  })

  it.each(CATALOGS)('says the quotas are capacity, not a price, in $locale', ({ locale, copy }) => {
    // D-095: a quota kept honest by there being no tier for it to sell into.
    const text = sectionText(copy.terms, 'free')
    expect(text).toContain(locale === 'id' ? 'bukan harga' : 'not a price')
  })

  it.each(CATALOGS)('says best effort rather than a guarantee, in $locale', ({ locale, copy }) => {
    const text = sectionText(copy.terms, 'free')
    expect(text).toContain(locale === 'id' ? 'sebisanya' : 'best effort')
  })

  it.each(CATALOGS)('says the data can leave, in $locale', ({ locale, copy }) => {
    const text = sectionText(copy.terms, 'free')
    expect(text).toContain(locale === 'id' ? 'bawa pergi' : 'take your data and leave')
  })

  it.each(CATALOGS)('links the self-hosting guide rather than asserting it, in $locale', ({ copy }) => {
    // D-096 makes self-hosting the pressure valve behind "free forever", and
    // docs/SELF-HOSTING.md is what makes that a supported configuration rather
    // than something you might be able to figure out. A link is checkable; a
    // sentence saying "you can self-host" is not.
    const text = sectionText(copy.terms, 'free')
    expect(text).toContain('github.com/katzelabs/konku/blob/main/docs/self-hosting.md')
  })

  it.each(CATALOGS)('never offers a paid tier in $locale', ({ copy }) => {
    // Hard rule 12: refusing the *option* matters more than refusing the
    // feature. A "supporter tier, later" in the terms is the option kept open.
    const body = documentText(copy.terms)

    for (const forbidden of [
      'berlangganan',
      'premium',
      'upgrade',
      'paid plan available',
      'supporter tier',
      'pro plan',
    ]) {
      expect(body, `the terms mention ${forbidden}`).not.toContain(forbidden)
    }
  })
})

/* ── Suspension (ticket 10 O1, migration 00013) ──────────────────────────── */

describe('suspension is documented', () => {
  // The column the needle list could not see. Naming it is not enough: what a
  // reader needs is what it does to their data, and the three facts that answer
  // that are all properties of the code rather than of the wording.

  it.each(CATALOGS)('says a suspension deletes nothing, in $locale', ({ locale, copy }) => {
    // Migration 00013 is deliberately not the `deleted_at` that 00009 removed.
    // The rows stay, the address stays claimed, and `konku suspend-user -undo`
    // puts the account back exactly as it was.
    const text = sectionText(copy.privacy, 'suspension')

    expect(text).toContain(locale === 'id' ? 'tidak ada yang dihapus' : 'nothing is deleted')
  })

  it.each(CATALOGS)('says a suspension is reversible, in $locale', ({ locale, copy }) => {
    const text = sectionText(copy.privacy, 'suspension')
    expect(text).toContain(locale === 'id' ? 'bisa dibatalkan' : 'can be undone')
  })

  it.each(CATALOGS)('says the timestamp answers "since when", in $locale', ({ locale, copy }) => {
    // NULL means active; the timestamp is the whole payload, and it is the
    // second question an operator — or the person suspended — asks.
    const text = sectionText(copy.privacy, 'suspension')
    expect(text).toContain(locale === 'id' ? 'sejak kapan' : 'since when')
  })

  it.each(CATALOGS)('says export is closed while suspended, in $locale', ({ locale, copy }) => {
    // `requireNotSuspended` sits above the whole authenticated group, which
    // includes GET /api/export and DELETE /api/account. The terms used to
    // promise a chance to download first; with the mechanism built, that is
    // only true if somebody opens the door, so both documents say who to ask.
    const privacy = sectionText(copy.privacy, 'suspension')
    const terms = sectionText(copy.terms, 'notAllowed')

    expect(privacy).toContain(locale === 'id' ? 'mengunduh' : 'export')
    expect(privacy).toContain('konku@katzeapps.com')
    expect(terms).toContain('konku@katzeapps.com')
  })
})

/* ── Tone (hard rule 6) ──────────────────────────────────────────────────── */

describe('never punitive, in a document that invites it', () => {
  // Terms pages are where products go to sound threatening, and English has far
  // more ways to do it than Indonesian does. `i18n/catalog.test.ts` guards the
  // main catalog; this is the same guard over the legal one, which is not in it.

  const ENGLISH = [
    'you must not',
    'you may not',
    'failure to comply',
    'at our sole discretion',
    'we reserve the right',
    'terminate',
    'violation',
    'prohibited',
    '!',
  ]
  const INDONESIAN = ['dilarang keras', 'wajib', 'sanksi', 'kami berhak', '!']

  it.each([
    { locale: 'en', copy: en, banned: ENGLISH },
    { locale: 'id', copy: id, banned: INDONESIAN },
  ])('$locale uses none of the phrases that make terms sound like a threat', ({ copy, banned }) => {
    const body = `${documentText(copy.privacy)} ${documentText(copy.terms)}`
    const found = banned.filter((phrase) => body.includes(phrase))

    expect(found).toEqual([])
  })

  it.each(CATALOGS)('does not claim things the product does not do, in $locale', ({ locale, copy }) => {
    const body = documentText(copy.privacy)

    expect(body).toContain(locale === 'id' ? 'tidak ada analytics' : 'no analytics')
    // The phrases that mean nothing, in both languages.
    for (const empty of [
      'kami sangat menjaga',
      'mitra terpercaya',
      'we take your privacy seriously',
      'trusted partners',
      'industry-standard',
    ]) {
      expect(body).not.toContain(empty)
    }
  })
})

/* ── The inline renderer ─────────────────────────────────────────────────── */

describe('inline markers', () => {
  it('renders bold as an element, never as markup', () => {
    render(<MemoryRouter>{parseInline('a *b* c')}</MemoryRouter>)
    expect(screen.getByText('b').tagName).toBe('STRONG')
  })

  it('routes an in-app path through the router and opens the rest in a tab', () => {
    render(
      <MemoryRouter>
        {parseInline('[terms](/terms) [guide](https://example.com) [mail](mailto:a@b.c)')}
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'terms' })).toHaveAttribute('href', '/terms')
    const external = screen.getByRole('link', { name: 'guide' })
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noreferrer')
    expect(screen.getByRole('link', { name: 'mail' })).not.toHaveAttribute('target')
  })

  it('leaves anything that is not a marker alone', () => {
    // Deliberately not a markdown subset: an unmatched marker is text.
    const { container } = render(<MemoryRouter>{parseInline('5 * 3, [a] and _b_')}</MemoryRouter>)
    expect(container.textContent).toBe('5 * 3, [a] and _b_')
    expect(container.querySelector('strong')).toBeNull()
  })

  it('does not carry state between calls', () => {
    // PATTERN is module-level and carries `g`, so a stateful exec loop would
    // leak `lastIndex` and drop the start of every string after the first.
    expect(parseInline('*a*').length).toBe(1)
    expect(parseInline('*a*').length).toBe(1)
  })
})

/* ── The pages render, in both languages ─────────────────────────────────── */

async function renderPage(locale: 'id' | 'en', ui: React.ReactNode) {
  // Both catalogs: the main one so `LocaleProvider` will actually switch to
  // this locale, and the legal one so `useLegalCopy()` reads it out of memory
  // rather than suspending. A suspension inside `render` resolves outside the
  // `act` scope, which is a warning in the console and a page that is still
  // empty when the assertion runs.
  await Promise.all([loadCatalog(locale), loadLegal(locale)])
  render(
    <MemoryRouter>
      <LocaleProvider locale={locale}>
        <Suspense fallback={null}>{ui}</Suspense>
      </LocaleProvider>
    </MemoryRouter>,
  )
}

describe('the pages', () => {
  it.each(CATALOGS)('renders the privacy policy in $locale', async ({ locale, copy }) => {
    await renderPage(locale, <PrivacyPage />)

    expect(await screen.findByRole('heading', { level: 1, name: copy.privacy.title })).toBeVisible()
    for (const section of PRIVACY_SECTIONS) {
      expect(
        await screen.findByRole('heading', { level: 2, name: copy.privacy.sections[section].heading }),
      ).toBeVisible()
    }
  })

  it.each(CATALOGS)('renders the terms in $locale', async ({ locale, copy }) => {
    await renderPage(locale, <TermsPage />)

    expect(await screen.findByRole('heading', { level: 1, name: copy.terms.title })).toBeVisible()
    for (const section of TERMS_SECTIONS) {
      expect(
        await screen.findByRole('heading', { level: 2, name: copy.terms.sections[section].heading }),
      ).toBeVisible()
    }
  })

  it('renders the sections in the order the shared tuple declares', async () => {
    // The order lives in one tuple both languages read, so it cannot differ
    // between them. What this asserts is that the page uses it rather than
    // Object.keys of whichever catalog it happened to be handed.
    await renderPage('id', <PrivacyPage />)

    const headings = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    const expected: string[] = PRIVACY_SECTIONS.map(
      (s: PrivacySection) => id.privacy.sections[s].heading,
    )

    expect(headings).toEqual(expected)
  })
})
