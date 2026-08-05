/**
 * The card syntax, as the preview understands it.
 *
 * This mirrors internal/card/parse.go closely enough that the preview tells
 * the truth about what will become a card. It is not authoritative — the
 * server parses on every save and its answer is the one that counts — but a
 * preview that disagreed with the parser would teach the syntax wrong.
 */

const SEPARATOR = '::'

/** The stable ID the parser writes back into the markdown. */
export const ID_COMMENT = /<!--\s*c:([A-Za-z0-9]+)\s*-->\s*$/

/**
 * The offset of the first separator that is not inside an inline code span,
 * or -1. Backticks are skipped so `depan :: belakang` in prose stays prose.
 */
export function findSeparator(s: string): number {
  let i = 0
  while (i < s.length) {
    if (s[i] === '`') {
      const n = runLength(s, i)
      const end = closingRun(s, i + n, n)
      // An unmatched run is literal text, not a span.
      if (end < 0) {
        i += n
        continue
      }
      i = end + n
      continue
    }
    if (s.startsWith(SEPARATOR, i)) return i
    i++
  }
  return -1
}

function runLength(s: string, i: number): number {
  let n = 0
  while (i + n < s.length && s[i + n] === '`') n++
  return n
}

function closingRun(s: string, from: number, n: number): number {
  let i = from
  while (i < s.length) {
    if (s[i] !== '`') {
      i++
      continue
    }
    const got = runLength(s, i)
    if (got === n) return i
    i += got
  }
  return -1
}

export interface ParsedCard {
  front: string
  back: string
  /** Present once the card has been saved and the parser assigned an ID. */
  id: string | null
}

/** Reads a single line as a card, or returns null if it is ordinary text. */
export function readCard(line: string): ParsedCard | null {
  const match = line.match(ID_COMMENT)
  const id = match ? match[1] : null
  const body = match ? line.slice(0, match.index) : line

  const at = findSeparator(body)
  if (at < 0) return null

  const front = body.slice(0, at).trim()
  const back = body.slice(at + SEPARATOR.length).trim()
  if (!front || !back) return null

  return { front, back, id }
}

/** How many cards the markdown currently holds, for the editor's hint line. */
export function countCards(md: string): number {
  let count = 0
  let fence: string | null = null

  for (const raw of md.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const delimiter = fenceDelimiter(line)

    if (fence) {
      if (delimiter && delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = null
      continue
    }
    if (delimiter) {
      fence = delimiter
      continue
    }
    if (readCard(line)) count++
  }
  return count
}

/** The fence run opening or closing a code block, or null. */
export function fenceDelimiter(line: string): string | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
  return match ? match[1] : null
}
