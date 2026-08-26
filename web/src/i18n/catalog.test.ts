import { describe, expect, it } from 'vitest'
import { en } from './en'
import { id } from './id'
import { bootLocale, rememberLocale } from './boot'
import { catalogLoaded, copyFor, DEFAULT_LOCALE, isLocale, loadCatalog, LOCALES } from './index'
import { pluralFor } from './plural'

/**
 * The second mechanism (hard rule 9).
 *
 * The `Copy` type is the first: a key in one catalog and not the other does not
 * compile. That is strong, and it has two holes this file covers.
 *
 * The first is optionality. The moment a field is declared `foo?: string` —
 * and the landing repo's `Feature.caption` shows how reasonable that looks —
 * the type stops requiring both catalogs to have it, and a screen renders a
 * caption in Indonesian and nothing in English. Parity is checked here by
 * walking the objects, so it does not care what the type made optional.
 *
 * The second is tone. `en.ts` opens with a paragraph about the vocabulary of
 * gentle blame that English has and Indonesian does not, and a paragraph is
 * a hope. This is the mechanism.
 */

type Node = unknown

/**
 * Both catalogs, for the tests that need to walk them.
 *
 * Built here rather than imported from `index.tsx`, which no longer exports a
 * map: `en` is behind a dynamic import so that it stays out of the entry chunk,
 * and a runtime map holding it would defeat that. A test file is not bundled,
 * so it may import both directly.
 */
const BOTH: Record<string, Node> = { id, en }

/** Every leaf, as `path -> kind`. Functions are probed for the strings inside. */
function walk(node: Node, path = '', out = new Map<string, string>()) {
  if (typeof node === 'string') {
    out.set(path, 'string')
    return out
  }

  if (typeof node === 'function') {
    // Arity is part of the contract: a translation that drops an argument
    // still typechecks if it ignores it, and then prints a sentence with the
    // value missing.
    out.set(path, `function/${(node as (...a: never[]) => string).length}`)
    return out
  }

  if (Array.isArray(node)) {
    out.set(path, `array/${node.length}`)
    node.forEach((child, i) => walk(child, `${path}[${i}]`, out))
    return out
  }

  if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) {
      walk(child, path ? `${path}.${key}` : key, out)
    }
    return out
  }

  out.set(path, typeof node)
  return out
}

/**
 * Every string a catalog can produce, including the ones built inside a
 * function. Functions are called with probe arguments rather than read as
 * source, so a plural's `one` and `other` forms are both seen.
 */
function allStrings(node: Node, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node)
    return out
  }

  if (typeof node === 'function') {
    const fn = node as (...args: unknown[]) => unknown
    // 1 and 2 cover `one` and `other` in every locale this app ships. The
    // string probe is for the functions that interpolate a name rather than a
    // count; passing a number to those is harmless.
    for (const probe of [1, 2, 0, 'x']) {
      try {
        const result = fn(...Array.from({ length: fn.length }, () => probe))
        if (typeof result === 'string') out.push(result)
      } catch {
        // A function that cannot be probed is not evidence of anything.
      }
    }
    return out
  }

  if (node && typeof node === 'object') {
    for (const child of Object.values(node)) allStrings(child, out)
  }

  return out
}

describe('catalog parity', () => {
  const idLeaves = walk(id)
  const enLeaves = walk(en)

  it('has the same keys in both directions', () => {
    const missingFromEn = [...idLeaves.keys()].filter((k) => !enLeaves.has(k))
    const missingFromId = [...enLeaves.keys()].filter((k) => !idLeaves.has(k))

    expect(missingFromEn, 'in id.ts and not in en.ts').toEqual([])
    expect(missingFromId, 'in en.ts and not in id.ts').toEqual([])
  })

  it('agrees on the shape of every key', () => {
    // A string in one catalog and a function in the other means one of them
    // stopped interpolating, which renders as a literal `#` on screen. A
    // tuple of three in one and two in the other renders as a short list.
    const mismatched = [...idLeaves.entries()]
      .filter(([key, kind]) => enLeaves.has(key) && enLeaves.get(key) !== kind)
      .map(([key, kind]) => `${key}: id=${kind} en=${enLeaves.get(key)}`)

    expect(mismatched).toEqual([])
  })

  it('has no blank strings', () => {
    // An empty string typechecks and reads as a missing translation nobody
    // reported, because there is nothing on screen to report.
    for (const [locale, catalog] of Object.entries(BOTH)) {
      const blank = allStrings(catalog).filter((s) => s.trim() === '')
      expect(blank, `blank strings in ${locale}.ts`).toEqual([])
    }
  })

  it('leaves no unreplaced placeholder', () => {
    // `#` survives into the output when a form is written without it.
    for (const [locale, catalog] of Object.entries(BOTH)) {
      const stray = allStrings(catalog).filter((s) => s.includes('#'))
      expect(stray, `unreplaced # in ${locale}.ts`).toEqual([])
    }
  })
})

describe('never punitive (hard rule 6)', () => {
  /**
   * The phrases that keep coming back. Not a complete list of ways to blame
   * someone in English — there is no such list — which is why the paragraph at
   * the top of `en.ts` is the real instruction and this is the backstop.
   */
  const ENGLISH = [
    "don't forget",
    'do not forget',
    'remember to',
    'make sure you',
    'you missed',
    'you forgot',
    'you fell behind',
    'falling behind',
    'behind on',
    'streak',
    'keep it up',
    'stay on track',
    "don't break",
    'oops',
    'uh oh',
    '!',
  ]

  const INDONESIAN = ['jangan lupa', 'kamu lupa', 'jangan sampai', 'beruntun', '!']

  const cases: { locale: string; catalog: Node; banned: string[] }[] = [
    { locale: 'en', catalog: en, banned: ENGLISH },
    { locale: 'id', catalog: id, banned: INDONESIAN },
  ]

  for (const { locale, catalog, banned } of cases) {
    it(`${locale}.ts uses none of the punitive phrases`, () => {
      const found = allStrings(catalog).flatMap((line) =>
        banned
          .filter((phrase) => line.toLowerCase().includes(phrase))
          .map((phrase) => `${phrase} — ${line}`),
      )

      expect(found).toEqual([])
    })
  }
})

describe('plural', () => {
  it('selects one and other in English', () => {
    const n = pluralFor('en')
    const forms = { one: '# card', other: '# cards' }

    expect(n(0, forms)).toBe('0 cards')
    expect(n(1, forms)).toBe('1 card')
    expect(n(2, forms)).toBe('2 cards')
  })

  it('falls back to other for a category a locale did not write', () => {
    // Indonesian has one form. Writing six would be six copies of the same
    // sentence, so `other` answers everything.
    const n = pluralFor('id')
    expect(n(1, { other: '# kartu' })).toBe('1 kartu')
    expect(n(2, { other: '# kartu' })).toBe('2 kartu')
  })

  it('formats the number for the locale', () => {
    // 07 L8's quotas are 5.000 notes and 20.000 cards. A raw `${n}` prints
    // 5000 in both languages and is wrong in both.
    expect(pluralFor('id')(5000, { other: '# catatan' })).toBe('5.000 catatan')
    expect(pluralFor('en')(5000, { one: '# note', other: '# notes' })).toBe('5,000 notes')
  })

  it('replaces every occurrence of the placeholder', () => {
    expect(pluralFor('en')(2, { other: '# of #' })).toBe('2 of 2')
  })
})

describe('the accessor', () => {
  it('lists Indonesian first, and lists the fallback', () => {
    expect(LOCALES).toEqual(['id', 'en'])
    expect(LOCALES).toContain(DEFAULT_LOCALE)
  })

  it('recognises only the locales that exist', () => {
    // I2 resolves a locale off a user setting and an Accept-Language header,
    // both of which are user input. `pt-BR` must not index the catalog.
    expect(isLocale('id')).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('pt-BR')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })

  it('falls back to Indonesian, which is the source language', () => {
    expect(DEFAULT_LOCALE).toBe('id')
  })
})

describe('the lazy split', () => {
  // English is behind `import()` so I5's two languages do not both land in the
  // chunk a signed-out stranger waits on. These assert the properties that buys
  // and the one it costs.

  it('has Indonesian in memory without loading anything', () => {
    // The fallback can never be a network request (hard rule 8): if it were,
    // a dropped connection would render nothing at all rather than Indonesian.
    expect(catalogLoaded('id')).toBe(true)
    expect(copyFor('id')).toBe(id)
  })

  it('falls back to Indonesian for a locale that has not arrived', () => {
    // Not a papered-over failure — it is the documented fallback, and it is
    // why a failed chunk fetch is a language downgrade rather than a blank page.
    expect(copyFor('en')).toBe(id)
  })

  it('serves English once its chunk is loaded', async () => {
    await loadCatalog('en')
    expect(catalogLoaded('en')).toBe(true)
    expect(copyFor('en')).toBe(en)
  })

  it('loads a chunk once, however many callers ask', async () => {
    // StrictMode mounts, unmounts and remounts every effect in dev, so the
    // provider asks twice for one switch. Sharing the in-flight promise is what
    // keeps that from being two fetches.
    const [a, b] = await Promise.all([loadCatalog('en'), loadCatalog('en')])
    expect(a).toBe(b)
    expect(a).toBe(en)
  })
})

describe('the boot hint', () => {
  // The first paint's locale has to be answerable synchronously, because an
  // effect runs after the paint and the wrong language is legible. Same shape
  // and same reason as web/public/theme.js (D-086).
  //
  // The order inside `bootLocale` is cache → browser → id, which is the
  // client's half of D-094's account → Accept-Language → id. The browser step
  // has to be stubbed in every case that is not about it, because jsdom
  // reports an English navigator and would otherwise make "the fallback" and
  // "the browser's answer" indistinguishable.

  /** Run `fn` with `navigator.languages` reporting `tags`. */
  function withBrowserLanguages<T>(tags: string[], fn: () => T): T {
    const original = Object.getOwnPropertyDescriptor(navigator, 'languages')
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => tags,
    })
    try {
      return fn()
    } finally {
      if (original) Object.defineProperty(navigator, 'languages', original)
      else delete (navigator as unknown as Record<string, unknown>).languages
    }
  }

  it('answers Indonesian when nothing is remembered and the browser asks for nothing we have', () => {
    expect(withBrowserLanguages(['pt-BR', 'ja'], bootLocale)).toBe('id')
  })

  it('reads back what was remembered', () => {
    rememberLocale('en')
    expect(withBrowserLanguages(['id'], bootLocale)).toBe('en')
  })

  it('ignores a stored value that is not a locale', () => {
    // The cache outlives deploys. A locale removed in a later version must not
    // be able to index the catalog from a browser that still has it.
    localStorage.setItem('konku.locale', 'pt-BR')
    expect(withBrowserLanguages(['pt-BR'], bootLocale)).toBe('id')
  })

  it('survives storage being unavailable', () => {
    // A private window, disabled site data, or a thumbnailer with a hostile
    // getter. None of them is a reason to fail to paint.
    const getItem = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('denied')
    }
    try {
      expect(withBrowserLanguages(['pt-BR'], bootLocale)).toBe('id')
    } finally {
      Storage.prototype.getItem = getItem
    }
  })

  // The browser step (ticket 11 I2). A stranger's first visit has no cache and
  // no account, so without this their first paint is Indonesian whatever they
  // asked for — and the correction would arrive after the paint, which is the
  // one thing this file exists to prevent.

  it('follows the browser when nothing is remembered', () => {
    expect(withBrowserLanguages(['en-GB', 'en'], bootLocale)).toBe('en')
    expect(withBrowserLanguages(['id-ID'], bootLocale)).toBe('id')
  })

  it('takes the first language it has copy for, not the first listed', () => {
    expect(withBrowserLanguages(['pt-BR', 'ja-JP', 'en-US'], bootLocale)).toBe('en')
  })

  it('lets the cache outrank the browser, because the account wrote it', () => {
    // The cache is written by resolution, so by the second visit it carries
    // the account's own setting — which outranks the browser (D-094).
    rememberLocale('id')
    expect(withBrowserLanguages(['en-US'], bootLocale)).toBe('id')
  })
})
