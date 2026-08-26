import type { ReactNode } from 'react'

/**
 * One marker, `*like this*`, rendered as `<strong>`.
 *
 * Two sentences on these screens show the reader the address back to them, in
 * the middle of a clause: "we sent a link to **you@example.com**", "if
 * **you@example.com** is registered". The emphasis is the point of those
 * screens — it is how somebody spots the typo that explains the mail that
 * never came — so it cannot be dropped, and splitting the sentence into a
 * before-half and an after-half around a `<span>` hands the translator two
 * fragments and takes word order away from them. The marker keeps each
 * sentence one string in the catalog with the emphasis where the translator
 * put it.
 *
 * **Never `innerHTML`.** That is D-018's property and it does not stop
 * mattering because the text came from our own catalog — the value being
 * interpolated here is an email address somebody typed into a form.
 *
 * `features/legal/inline.tsx` does the same job for the policy documents, with
 * links as well as bold. This is not that: it is the two lines of it these
 * screens need, and the two are kept apart deliberately so that the auth entry
 * chunk — the one a signed-out stranger waits on — does not pull in a module
 * built for a different feature. If a third caller ever wants links here, the
 * right move is to merge the two, not to grow this one.
 *
 * Anything that is not a `*…*` pair renders as itself. A lone `*` is an
 * asterisk. No nesting, no escaping.
 */
const PATTERN = /\*([^*\n]+)\*/g

export function Emphasis({ text }: { text: string }) {
  return <>{parseEmphasis(text)}</>
}

/** Exported for the test, and for anything that wants the runs without JSX. */
export function parseEmphasis(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0

  // `matchAll` rather than a stateful `exec` loop: PATTERN is module-level and
  // carries `g`, so `lastIndex` would leak between calls and skip the start of
  // every string after the first.
  for (const match of text.matchAll(PATTERN)) {
    const at = match.index
    if (at > last) out.push(text.slice(last, at))
    out.push(
      <strong key={at} className="font-medium text-surface-fg">
        {match[1]}
      </strong>,
    )
    last = at + match[0].length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}
