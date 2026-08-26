import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useLegalCopy } from '../../i18n/legal'
import { CONTACT_EMAIL, type Block, type LegalDocument } from '../../i18n/legal/types'
import { Inline } from './inline'

/**
 * The frame for the two documents nobody reads until they need to (07 L9,
 * bilingual in ticket 11 I4).
 *
 * Deliberately plain: no card, no chrome, generous measure. These are prose,
 * and prose is easier to trust when it looks like prose rather than like a
 * feature.
 *
 * They render outside the app shell and are reachable signed out, because the
 * two moments someone wants them are before signing up and after deciding to
 * leave — neither of which is a moment they are inside the app.
 *
 * It takes the document rather than children now. That is what makes the two
 * languages the same document: the section order comes from one shared tuple
 * (`PRIVACY_SECTIONS`, `TERMS_SECTIONS`) rather than from the order somebody
 * happened to write the JSX in, so a translation cannot reorder or drop a
 * section without failing to compile.
 */
export function LegalPage<S extends string>({
  doc,
  order,
}: {
  doc: LegalDocument<S>
  /** The section order. Shared by both languages; see `i18n/legal/types.ts`. */
  order: readonly S[]
}) {
  const c = useLegalCopy()

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-6 py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-fg underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" />
        {c.frame.back}
      </Link>

      <h1 className="mt-8 text-2xl font-bold tracking-tight text-surface-fg">{doc.title}</h1>
      <p className="mt-1 text-sm text-muted-fg">{c.frame.updatedPrefix(doc.updated)}</p>

      {/*
        The typography is set here rather than per-page so the two documents
        cannot drift apart. No prose plugin: a handful of element selectors is
        less than the dependency would cost (D-065).
      */}
      <div
        className="mt-8 flex flex-col gap-4 text-sm leading-relaxed text-secondary-fg
          [&_a]:text-surface-fg [&_a]:underline [&_a]:underline-offset-4
          [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-surface-fg
          [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-surface-fg
          [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2"
      >
        {doc.intro.map((block, i) => (
          <Blocks key={`intro-${i}`} block={block} />
        ))}

        {order.map((id) => {
          const section = doc.sections[id]
          return (
            <section key={id} className="flex flex-col gap-4">
              <h2>{section.heading}</h2>
              {section.blocks.map((block, i) => (
                <Blocks key={i} block={block} />
              ))}
            </section>
          )
        })}

        {doc.outro.map((block, i) => (
          <Blocks key={`outro-${i}`} block={block} />
        ))}
      </div>

      <p className="mt-12 border-t border-border pt-6 text-sm text-muted-fg">
        {c.frame.contact}{' '}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-surface-fg underline underline-offset-4"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </main>
  )
}

function Blocks({ block }: { block: Block }) {
  if (block.kind === 'p') return <p><Inline text={block.text} /></p>

  return (
    <ul>
      {block.items.map((item, i) => (
        <li key={i}>
          <Inline text={item} />
        </li>
      ))}
    </ul>
  )
}
