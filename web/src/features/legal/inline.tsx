import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * The two markers the legal copy is allowed to use, rendered as React elements.
 *
 *   `*bold*`              → <strong>
 *   `[label](/terms)`     → <Link>, for a path inside the app
 *   `[label](https://…)`  → <a target="_blank">
 *   `[label](mailto:…)`   → <a>
 *
 * **Never `innerHTML`.** That is the property D-018 is about, and it does not
 * stop mattering because the text came from our own catalog: the day somebody
 * interpolates an account's name into a sentence here, the difference between
 * "elements" and "markup" is the whole of it.
 *
 * ## Why this exists rather than react-markdown
 *
 * react-markdown and remark-gfm are already dependencies, and reusing them was
 * the first option. They would land in the chunk a signed-out stranger
 * downloads to read a privacy policy — the whole markdown pipeline, to render
 * two kinds of span — and this is thirty lines. D-065 asks a dependency to name
 * the obligation it discharges; "we already have it" is not the same thing as
 * needing it here.
 *
 * ## Deliberately not a markdown subset
 *
 * One level of bold, no nesting, no escaping, and anything that is not one of
 * the two forms renders as itself. A `*` on its own is an asterisk. That is a
 * real limitation and it is the point: a parser with edge cases in a document
 * whose whole value is being exactly right is a bad trade.
 */
const PATTERN = /\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g

export function Inline({ text }: { text: string }) {
  return <>{parseInline(text)}</>
}

/** Exported for the test, and for anything that needs the runs without JSX. */
export function parseInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0

  // `matchAll` rather than a stateful `exec` loop: PATTERN is module-level and
  // carries `g`, so `lastIndex` would leak between calls and skip the start of
  // every string after the first.
  for (const match of text.matchAll(PATTERN)) {
    const at = match.index
    if (at > last) out.push(text.slice(last, at))

    const [whole, bold, label, href] = match
    if (bold !== undefined) {
      out.push(<strong key={at}>{bold}</strong>)
    } else if (label !== undefined && href !== undefined) {
      out.push(renderLink(at, label, href))
    }

    last = at + whole.length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderLink(key: number, label: string, href: string): ReactNode {
  // A path inside the app is a client-side navigation. Anything else is not:
  // `mailto:` has no route, and an external URL would be swallowed by the SPA
  // router and turned into a 404 that looks like a broken document.
  if (href.startsWith('/')) {
    return (
      <Link key={key} to={href}>
        {label}
      </Link>
    )
  }

  const external = href.startsWith('http')
  return (
    <a
      key={key}
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {label}
    </a>
  )
}
