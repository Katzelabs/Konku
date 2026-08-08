import { type ReactNode } from 'react'
import { fenceDelimiter, readCard } from './cards'

/**
 * A small markdown renderer for the editor preview.
 *
 * It renders to React elements rather than an HTML string, so there is no
 * dangerouslySetInnerHTML anywhere and note content can never execute. That
 * matters more here than completeness: in v0.3 an agent writes notes through
 * MCP, and untrusted markdown reaching innerHTML would be a standing XSS.
 *
 * Deliberately partial. The MVP editor is a textarea (D-018) and the preview
 * only has to make the structure legible — headings, lists, code, and above
 * all which lines are going to become cards.
 */
export function renderMarkdown(md: string): ReactNode {
  const lines = md.split('\n')
  const out: ReactNode[] = []

  let paragraph: string[] = []
  let list: string[] = []
  let quote: string[] = []
  let code: string[] | null = null
  let fence = ''
  let key = 0

  function flushParagraph() {
    if (!paragraph.length) return
    out.push(
      <p key={key++} className="text-reading text-reading-fg">
        {renderInline(paragraph.join(' '))}
      </p>,
    )
    paragraph = []
  }

  function flushList() {
    if (!list.length) return
    out.push(
      <ul key={key++} className="list-disc space-y-1 pl-5 text-reading text-reading-fg">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    )
    list = []
  }

  function flushQuote() {
    if (!quote.length) return
    out.push(
      <blockquote key={key++} className="rounded-r-md border-l-2 border-primary bg-accent py-2 pl-4 text-reading text-accent-fg">
        {renderInline(quote.join(' '))}
      </blockquote>,
    )
    quote = []
  }

  function flushAll() {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    const delimiter = fenceDelimiter(line)

    if (code !== null) {
      if (delimiter && delimiter[0] === fence[0] && delimiter.length >= fence.length) {
        out.push(
          <pre key={key++} className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm text-secondary-fg">
            <code>{code.join('\n')}</code>
          </pre>,
        )
        code = null
        fence = ''
      } else {
        code.push(line)
      }
      continue
    }

    if (delimiter) {
      flushAll()
      code = []
      fence = delimiter
      continue
    }

    if (!line.trim()) {
      flushAll()
      continue
    }

    // A card line is shown as a card, not as prose. This is the preview's
    // main job: seeing the pair render is how the `::` syntax gets learned.
    const card = readCard(line)
    if (card) {
      flushAll()
      out.push(
        <div key={key++} className="rounded-lg border border-border bg-muted px-4 py-3">
          <p className="font-medium text-card-fg">{renderInline(card.front)}</p>
          <p className="mt-1 text-reading-fg">{renderInline(card.back)}</p>
          {!card.id && (
            /* Not yet saved, so the parser has not given it an ID. Said
               without alarm — it is simply not saved yet. */
            <p className="mt-2 text-xs text-subtle-fg">Kartu baru</p>
          )}
        </div>,
      )
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushAll()
      const level = heading[1].length
      const size = level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : 'text-base'
      out.push(
        <p key={key++} className={`${size} font-semibold text-card-fg`}>
          {renderInline(heading[2])}
        </p>,
      )
      continue
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    if (bullet) {
      flushParagraph()
      flushQuote()
      list.push(bullet[1])
      continue
    }

    const quoted = line.match(/^\s*>\s?(.*)$/)
    if (quoted) {
      flushParagraph()
      flushList()
      quote.push(quoted[1])
      continue
    }

    flushList()
    flushQuote()
    paragraph.push(line)
  }

  if (code !== null) {
    out.push(
      <pre key={key++} className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm text-secondary-fg">
        <code>{code.join('\n')}</code>
      </pre>,
    )
  }
  flushAll()

  return <div className="flex max-w-reading-measure flex-col gap-4">{out}</div>
}

/** Inline code, bold and italic. Everything else stays literal text. */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g

  let last = 0
  let key = 0
  for (const match of text.matchAll(pattern)) {
    const at = match.index
    if (at > last) out.push(text.slice(last, at))
    const token = match[0]

    if (token.startsWith('`')) {
      out.push(
        <code key={key++} className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**')) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>)
    }
    last = at + token.length
  }
  if (last < text.length) out.push(text.slice(last))

  return out
}
