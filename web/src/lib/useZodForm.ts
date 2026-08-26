import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react'
import type { z } from 'zod'
import { useCopy, type Copy } from '../i18n'

/**
 * A form backed by a zod schema.
 *
 * Deliberately not react-hook-form. The dependency budget asks what production
 * obligation a package discharges (D-065), and four short signed-out forms
 * with no arrays, no wizards and no dynamic fields do not reach for a form
 * library — this is the part of one that they actually use. Zod earns its
 * place by being the schema; a second package to drive four `<input>`s would
 * not.
 *
 * The behaviour is the part worth stating, because it is what separates a
 * validated form from an annoying one:
 *
 *   - **Nothing is validated while you are first typing.** A "format email
 *     belum benar" that appears at `n`, `na`, `nam` is noise, and it is wrong
 *     every time until the moment it is right.
 *   - **A field is checked when you leave it**, which is when you have
 *     finished saying what you meant.
 *   - **Once a field is showing an error it re-checks on every keystroke**, so
 *     the message disappears the instant it stops being true rather than at
 *     the next blur. This is the asymmetry that makes correction feel quick.
 *   - **Submitting checks everything** and marks every field touched, so a
 *     form submitted blank shows all of its problems at once instead of one
 *     per attempt.
 *
 * `values` is kept as strings throughout. The parsed, transformed output —
 * trimmed names, trimmed address — is what `onValid` receives, so callers send
 * the cleaned value while the person still sees exactly what they typed.
 *
 * **The schema may be a builder** (11 I5). A validation message is copy, so a
 * schema that carries its messages needs a locale, and a module-level schema
 * would have had to choose one at import time — which is how a form ends up
 * permanently Indonesian in a way nothing notices. Passing
 * `(copy: Copy) => schema` lets this hook supply the active locale, which it
 * can because it is a hook and the schemas are not. A plain schema still works
 * unchanged; nothing at a call site had to move.
 */

type Errors<T> = Partial<Record<keyof T & string, string>>

export interface ZodForm<In extends Record<string, string>, Out> {
  values: In
  errors: Errors<In>
  /** True once submit has been attempted. Drives the form-level summary. */
  submitted: boolean
  setValue: (field: keyof In & string, value: string) => void
  /**
   * The value and the handlers, and deliberately nothing else.
   *
   * The `aria-invalid` / `aria-describedby` pair is owned by `<Field>`, which
   * is the component that knows whether a hint or an error is on screen. Two
   * owners for one attribute is how an input ends up pointing at an id that
   * was not rendered.
   */
  field: (field: keyof In & string) => {
    name: string
    value: string
    onChange: (e: { target: { value: string } }) => void
    onBlur: () => void
  }
  handleSubmit: (onValid: (values: Out) => void) => (e: FormEvent) => void
  reset: () => void
}

export function useZodForm<In extends Record<string, string>, Out>(
  source: z.ZodType<Out, In> | ((copy: Copy) => z.ZodType<Out, In>),
  initial: In,
): ZodForm<In, Out> {
  const copy = useCopy()

  // Memoised, and the memo is load-bearing. `validate` — and through it
  // `field`, `setValue` and `handleSubmit` — is rebuilt whenever the schema's
  // identity changes, so a schema rebuilt on every render would hand every
  // input a new `onChange` on every keystroke. A catalog is one object per
  // locale, built once when its module is evaluated, so it changes exactly
  // when the language does; a builder is a module-level function, so it never
  // does.
  const schema = useMemo(
    () => (typeof source === 'function' ? source(copy) : source),
    [source, copy],
  )

  const [values, setValues] = useState<In>(initial)
  const [errors, setErrors] = useState<Errors<In>>({})
  const [touched, setTouched] = useState<Partial<Record<string, true>>>({})
  const [submitted, setSubmitted] = useState(false)

  // Read inside callbacks that must not be re-created on every keystroke.
  const latest = useRef({ values, errors, touched })
  latest.current = { values, errors, touched }

  /**
   * Run the schema and return the errors, one per field.
   *
   * First issue per path wins. A field showing two messages at once is a field
   * the reader has to prioritise themselves, and the first is the one the
   * schema considers most fundamental — "wajib diisi" before "minimal 12
   * karakter", which is the order someone fixes them in anyway.
   */
  const validate = useCallback(
    (next: In): { errors: Errors<In>; output?: Out } => {
      const result = schema.safeParse(next)
      if (result.success) return { errors: {}, output: result.data }

      const found: Errors<In> = {}
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '') as keyof In & string
        if (key && found[key] === undefined) found[key] = issue.message
      }
      return { errors: found }
    },
    [schema],
  )

  const setValue = useCallback(
    (field: keyof In & string, value: string) => {
      const next = { ...latest.current.values, [field]: value } as In
      setValues(next)

      // Only re-check a field that is already complaining, or one the user has
      // left once. Validating a pristine field on its first keystroke is the
      // behaviour that makes forms feel hostile.
      const shouldCheck =
        latest.current.errors[field] !== undefined || latest.current.touched[field]
      if (!shouldCheck) return

      const { errors: found } = validate(next)
      setErrors((prev) => {
        const out = { ...prev }
        if (found[field] === undefined) delete out[field]
        else out[field] = found[field]

        // A cross-field rule has to clear from the other side too. Typing in
        // `password` is what fixes a "kata sandinya belum sama" that is sitting
        // on `confirmPassword`, and leaving it there until the confirm field is
        // touched again reads as the form ignoring the fix.
        for (const key of Object.keys(prev) as (keyof In & string)[]) {
          if (key !== field && prev[key] && found[key] === undefined) delete out[key]
        }
        return out
      })
    },
    [validate],
  )

  const onBlur = useCallback(
    (field: keyof In & string) => {
      setTouched((prev) => ({ ...prev, [field]: true }))
      const { errors: found } = validate(latest.current.values)
      setErrors((prev) => {
        const out = { ...prev }
        if (found[field] === undefined) delete out[field]
        else out[field] = found[field]
        return out
      })
    },
    [validate],
  )

  const field = useCallback(
    (name: keyof In & string) => ({
      name,
      value: values[name] ?? '',
      onChange: (e: { target: { value: string } }) => setValue(name, e.target.value),
      onBlur: () => onBlur(name),
    }),
    [values, setValue, onBlur],
  )

  const handleSubmit = useCallback(
    (onValid: (out: Out) => void) => (e: FormEvent) => {
      e.preventDefault()
      setSubmitted(true)

      const { errors: found, output } = validate(latest.current.values)
      setErrors(found)
      // Everything is touched from here on, so any field the user goes back
      // and edits re-checks as they type rather than waiting for another blur.
      setTouched(
        Object.fromEntries(Object.keys(latest.current.values).map((k) => [k, true])),
      )
      if (output === undefined) return
      onValid(output)
    },
    [validate],
  )

  const reset = useCallback(() => {
    setValues(initial)
    setErrors({})
    setTouched({})
    setSubmitted(false)
    // `initial` is a literal at every call site, so a dependency on it would
    // rebuild this on every render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useMemo(
    () => ({ values, errors, submitted, setValue, field, handleSubmit, reset }),
    [values, errors, submitted, setValue, field, handleSubmit, reset],
  )
}
