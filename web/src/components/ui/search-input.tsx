import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from './input'
import { cn } from '../../lib/utils'

/** How long typing has to stop before the query reaches the URL. */
const DEBOUNCE_MS = 250

/**
 * The search box on the two index screens.
 *
 * The URL stays the source of truth for the filter — that is what makes a
 * search a link, and what keeps the top bar's box and this one from
 * disagreeing. It stops being the source of truth for each individual letter
 * (F-08).
 *
 * Both pages wrote `?q=` straight from `onChange`, so every keystroke was a
 * `replaceState`, and each one changed the filtered id list, which re-fired
 * `useAutoSelect` into a second `navigate(…, {replace: true})`. Roughly two
 * history writes per character: Safari throws SecurityError past ~100 in
 * thirty seconds and Firefox rate-limits similarly, which two or three quick
 * searches can reach. Since D-084 the query is also part of the React Query
 * key, so it was one request per character as well.
 *
 * The box therefore holds its own text and pushes it up once typing pauses.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
  delay = DEBOUNCE_MS,
}: {
  /** The committed query — what is in the URL right now. */
  value: string
  onChange: (next: string) => void
  placeholder: string
  /** For the screen reader. A placeholder is not a label (F-12). */
  label: string
  className?: string
  delay?: number
}) {
  const [text, setText] = useState(value)

  /*
   * The last value this component and its parent agreed on.
   *
   * Without it the effect below cannot tell our own echo — the URL coming
   * back with what we just sent — from a genuine outside change, and syncing
   * on the echo would overwrite whatever was typed during the round trip.
   */
  const settled = useRef(value)

  // Back, a cleared filter, or a fresh navigation wins over the box.
  useEffect(() => {
    if (value === settled.current) return
    settled.current = value
    setText(value)
  }, [value])

  // Held in a ref so the debounce keys on the text alone. Both call sites pass
  // an inline arrow, which is a new function every render, and depending on it
  // would restart the timer on every unrelated re-render — including the ones
  // this page does while a query settles, which is exactly when it would never
  // fire.
  const commit = useRef(onChange)
  useEffect(() => {
    commit.current = onChange
  })

  useEffect(() => {
    if (text === settled.current) return
    const id = setTimeout(() => {
      settled.current = text
      commit.current(text)
    }, delay)
    return () => clearTimeout(id)
  }, [text, delay])

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-fg" />
      <Input
        type="search"
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter is someone saying they are done typing. Waiting out the
          // debounce after that reads as a dropped keystroke.
          if (e.key !== 'Enter') return
          e.preventDefault()
          settled.current = text
          commit.current(text)
        }}
        placeholder={placeholder}
        // type="search" for the role it gives a screen reader; the native
        // cancel button that comes with it is the one piece of browser chrome
        // this design system has no token for, so it goes.
        className="pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  )
}
