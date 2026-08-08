import type { ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/utils'

/**
 * Rendered markdown, styled off the tokens.
 *
 * This replaces a hand-written renderer that existed for one reason worth
 * repeating: it produced React elements rather than an HTML string, so note
 * content could never execute. In v0.3 an agent writes notes through MCP, and
 * untrusted markdown reaching innerHTML would be a standing XSS.
 *
 * react-markdown keeps that property — it builds an element tree and does not
 * touch innerHTML. A `marked` + dangerouslySetInnerHTML swap would look like a
 * simplification and quietly remove the guarantee, so: **do not introduce
 * rehype-raw here.** It re-enables embedded HTML, which is the same hole by a
 * different door.
 *
 * Every element is mapped explicitly. Tailwind's typography plugin would be
 * the obvious shortcut and is deliberately not used — it ships its own colour
 * and spacing scale, which is a second source of truth for "what colour is
 * that" (D-053).
 */
export function Markdown({
  children,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { children: string }) {
  return (
    <div
      className={cn('flex max-w-reading-measure flex-col gap-4', className)}
      {...props}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Compact markdown for a card's two sides.
 *
 * Same renderer, tighter rhythm and no reading measure: a card front sits in a
 * grid tile or a review screen, where prose line-length rules do not apply.
 */
export function MarkdownInline({
  children,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { children: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

const components: ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: ({ node, ...props }) => (
    <h1 className="text-xl font-semibold text-card-fg" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="text-lg font-semibold text-card-fg" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="text-base font-semibold text-card-fg" {...props} />
  ),
  // Markdown allows six levels; past three they are all "a small heading".
  h4: ({ node, ...props }) => (
    <h4 className="text-base font-semibold text-card-fg" {...props} />
  ),
  h5: ({ node, ...props }) => (
    <h5 className="text-base font-semibold text-card-fg" {...props} />
  ),
  h6: ({ node, ...props }) => (
    <h6 className="text-base font-semibold text-card-fg" {...props} />
  ),

  p: ({ node, ...props }) => (
    <p className="text-reading text-reading-fg" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul
      className="list-disc space-y-1 pl-5 text-reading text-reading-fg"
      {...props}
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      className="list-decimal space-y-1 pl-5 text-reading text-reading-fg"
      {...props}
    />
  ),
  li: ({ node, ...props }) => <li className="marker:text-subtle-fg" {...props} />,

  blockquote: ({ node, ...props }) => (
    <blockquote
      className="rounded-r-md border-l-2 border-primary bg-accent py-2 pl-4 text-reading text-accent-fg [&>p]:text-accent-fg"
      {...props}
    />
  ),

  // A fenced block arrives as <pre><code>; an inline span arrives as a bare
  // <code>. Styling only <code> would put block padding inside the <pre> and
  // give fenced code a doubled background.
  pre: ({ node, ...props }) => (
    <pre
      className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm text-secondary-fg [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    />
  ),
  code: ({ node, ...props }) => (
    <code
      className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]"
      {...props}
    />
  ),

  a: ({ node, ...props }) => (
    <a
      className="text-primary underline underline-offset-2 hover:no-underline"
      // Notes carry source links (D-013) and those are external by nature.
      // noreferrer is not decoration: without it the target learns where the
      // click came from, and this is a private knowledge base.
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  ),

  hr: ({ node, ...props }) => (
    <hr className="border-border" {...props} />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-card-fg" {...props} />
  ),

  // GFM tables. Wrapped rather than allowed to widen the page: a table with
  // eight columns must scroll inside itself, not push the layout sideways.
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th
      className="border border-border bg-muted px-3 py-2 text-left font-medium text-card-fg"
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td className="border border-border px-3 py-2 text-reading-fg" {...props} />
  ),

  // GFM task lists. Read-only: ticking a box here would not write anything
  // back to the markdown, and a checkbox that silently forgets is worse than
  // one that plainly cannot be clicked.
  input: ({ node, ...props }) => (
    <input
      className="mr-1 align-middle accent-primary"
      {...props}
      disabled
      readOnly
    />
  ),
}
