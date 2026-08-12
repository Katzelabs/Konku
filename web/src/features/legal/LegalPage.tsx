import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * The frame for the two documents nobody reads until they need to (07 L9).
 *
 * Deliberately plain: no card, no chrome, generous measure. These are prose,
 * and prose is easier to trust when it looks like prose rather than like a
 * feature.
 *
 * They render outside the app shell and are reachable signed out, because the
 * two moments someone wants them are before signing up and after deciding to
 * leave — neither of which is a moment they are inside the app.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-6 py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-fg underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" />
        Kembali
      </Link>

      <h1 className="mt-8 text-2xl font-bold tracking-tight text-surface-fg">{title}</h1>
      <p className="mt-1 text-sm text-muted-fg">Terakhir diperbarui: {updated}</p>

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
        {children}
      </div>

      <p className="mt-12 border-t border-border pt-6 text-sm text-muted-fg">
        Ada yang kurang jelas? Tulis ke{' '}
        <a href="mailto:konku@katzeapps.com" className="text-surface-fg underline underline-offset-4">
          konku@katzeapps.com
        </a>
        .
      </p>
    </main>
  )
}
