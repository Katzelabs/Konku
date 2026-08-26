import { useMemo } from 'react'
import { useCopy, useLocale } from '../i18n'
import { dateFormatters, relativeDays, type DateFormatters } from './date'

/**
 * The date formatters for the language currently on screen.
 *
 *     const d = useDateFormat()
 *     <span>{d.humanDay(note.updatedAt)}</span>
 *
 * A hook rather than a set of free functions because the answer depends on the
 * active locale, and reading that from a module-level variable would make the
 * value invisible to React — a language change would leave every rendered date
 * in the old one until something else happened to re-render it.
 *
 * Memoised on the locale, because the `Intl` objects inside are not free to
 * construct and a list calls these once per row.
 */
export function useDateFormat(): DateFormatters {
  const locale = useLocale()
  const copy = useCopy()
  const relative = relativeDays(copy)

  return useMemo(
    () => dateFormatters(locale, relative),
    // The labels come from the catalog for this locale, so the locale is the
    // whole of the dependency — `relative` is a fresh object every render and
    // would defeat the memo if it were listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  )
}
