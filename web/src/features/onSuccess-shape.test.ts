import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The second mechanism behind the braces rule (hard rule 9).
 *
 * The behavioural test in mutations.test.tsx proves *why* the rule exists, but
 * it only exercises the mutations it constructs itself. This one reads the
 * source of every mutation that actually ships, so a new one written the wrong
 * way fails without anybody having to remember to write a test for it.
 *
 * A regex rather than a real parser, deliberately: adding a TypeScript AST
 * dependency to enforce one convention is not a production obligation, which
 * is the bar D-065 sets for a new dependency. The pattern it looks for is
 * narrow and the failure message says exactly what to do.
 */

const FEATURES = dirname(fileURLToPath(import.meta.url))

function queryFiles(): string[] {
  const out: string[] = []
  for (const entry of readdirSync(FEATURES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = join(FEATURES, entry.name, 'queries.ts')
    try {
      readFileSync(candidate)
      out.push(candidate)
    } catch {
      // Not every feature has server state.
    }
  }
  return out
}

/**
 * Captures the first non-whitespace character of an `onSuccess` arrow body.
 *
 * A capture rather than a negative lookahead: `=>\s*(?!\{)` looks correct and
 * is not, because `\s*` backtracks and gives the whitespace back, so the
 * lookahead succeeds against a space and every well-written mutation is
 * reported as an offender. Capturing forces the whitespace to be consumed.
 *
 * An expression-bodied arrow returns its expression. When that expression is a
 * call to invalidateQueries — or anything else returning a promise — TanStack
 * Query awaits it before running the callbacks passed to `mutate`.
 */
const ON_SUCCESS_BODY = /onSuccess:\s*(?:async\s*)?\(?[^)=]*\)?\s*=>\s*(\S)/g

describe('every shipped mutation uses braces in onSuccess', () => {
  const files = queryFiles()

  it('finds the feature query files at all', () => {
    // Without this the suite passes vacuously the day the folder layout
    // changes, which is the failure mode of every source-scanning test.
    expect(files.length).toBeGreaterThanOrEqual(6)
  })

  for (const file of files) {
    const name = file.slice(file.indexOf('/features/'))

    it(`${name} has no expression-bodied onSuccess`, () => {
      const source = readFileSync(file, 'utf8')
      const offenders: string[] = []

      for (const match of source.matchAll(ON_SUCCESS_BODY)) {
        if (match[1] === '{') continue
        const line = source.slice(0, match.index).split('\n').length
        const snippet = source.split('\n')[line - 1].trim()
        offenders.push(`  line ${line}: ${snippet}`)
      }

      expect(
        offenders,
        `onSuccess must use braces so nothing is returned and nothing is awaited:\n` +
          `${offenders.join('\n')}\n\n` +
          `  onSuccess: () => qc.invalidateQueries(...)     // wrong\n` +
          `  onSuccess: () => { qc.invalidateQueries(...) } // right\n\n` +
          `See mutations.test.tsx for what returning it actually does.`,
      ).toEqual([])
    })
  }
})
