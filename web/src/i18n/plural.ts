import type { Locale } from './types'

/**
 * Plurals and number formatting, in about twenty lines.
 *
 * `Intl.PluralRules` is the whole mechanism. D-065 asks a dependency to name
 * the production obligation it discharges, and the obligation here — "one
 * card" versus "2 cards", in two languages — is one the platform already
 * discharges. `i18next` and `react-intl` were rejected for exactly that
 * reason (D-094).
 *
 * `#` is the count's placeholder, borrowed from ICU so the shape stays
 * recognisable to anyone who has written a message catalog before.
 *
 * The count is formatted with `Intl.NumberFormat`, never interpolated raw:
 * Indonesian writes 5.000 where English writes 5,000, and the quotas from
 * 07 L8 are 5.000 notes and 20.000 cards. A raw `${n}` prints 5000 in both.
 */

/**
 * The plural categories CLDR defines. Indonesian uses `other` only; English
 * uses `one` and `other`. Every locale has `other`, which is why it is the one
 * form a catalog is required to supply.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & {
  other: string
}

export type Pluralize = (n: number, forms: PluralForms) => string

/**
 * Bind a pluralizer to one locale. Each catalog makes one at the top of the
 * file and uses it for every counted string in that file.
 *
 * Built once per locale rather than per call: `Intl.PluralRules` and
 * `Intl.NumberFormat` are not free to construct, and these two live for the
 * lifetime of the module.
 */
export function pluralFor(locale: Locale): Pluralize {
  const rules = new Intl.PluralRules(locale)
  const numbers = new Intl.NumberFormat(locale)

  return (n, forms) => {
    // `?? forms.other` is not a fallback for a missing translation — it is how
    // a catalog says "this language does not distinguish that category". A
    // locale that selects `few` where only `other` was written gets the right
    // sentence, and Indonesian gets to write one form instead of six.
    const form = forms[rules.select(n)] ?? forms.other
    return form.replaceAll('#', numbers.format(n))
  }
}
