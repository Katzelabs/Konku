import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Label } from './label'

/** What a control must spread to be labelled, described and marked invalid. */
export interface FieldControlProps {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

/**
 * A labelled form control with room for a hint and an error.
 *
 * Extracted when the signed-out forms grew from two fields to five: the label,
 * the spacing, the hint and the error were being repeated per field, and the
 * `aria-describedby` wiring was being repeated *wrong* — an id typed twice is
 * an id that eventually differs from the element it points at.
 *
 * So this component owns the whole aria triple and hands it to the control
 * through a render prop. `useZodForm` deliberately does not emit any of it:
 * this is the only place that knows whether a hint or an error is on screen,
 * and two owners for one attribute is how an input ends up describing itself
 * by an id nobody rendered.
 *
 * The error replaces the hint rather than stacking under it. Two lines of
 * small grey-and-red text under one input is a field that looks broken even
 * once it is fixed, and the hint's job — "here is the rule" — is finished the
 * moment the message says which rule was missed.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  /** Marks the field as skippable, in words rather than by absence of an asterisk. */
  optional?: boolean
  className?: string
  children: (control: FieldControlProps) => ReactNode
}) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {/*
          The convention is inverted on purpose: optional fields are marked and
          required ones are not. A form where four of five fields carry a red
          asterisk has taught the reader nothing except that asterisks are
          decoration.
        */}
        {optional && <span className="ml-1.5 font-normal text-subtle-fg">(opsional)</span>}
      </Label>

      {children({
        id,
        // Only when true. `aria-invalid="false"` on every field is noise that
        // a screen reader still has to say out loud.
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}

      {error ? (
        /*
         * role="alert" so it is announced when it appears. Calm, not alarming:
         * a mistyped password is an ordinary event, and hard rule 6 rules out
         * treating an ordinary event as a telling-off. Red here is the "this
         * specific line is wrong" marker the eye needs on a five-field form,
         * not a scolding — the copy carries the tone.
         */
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-sm text-muted-fg">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
