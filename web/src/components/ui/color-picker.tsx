import { useCopy } from '../../i18n'
import { cn } from '../../lib/utils'
import { Input } from './input'
import { Label } from './label'

/**
 * The starting palette offered to domains and categories.
 *
 * Deliberately muted, and deliberately not exhaustive — the field next to it
 * takes any `#RRGGBB`. These are user data rather than design tokens, which is
 * the one documented exception to "a component never names a colour"
 * (DESIGN.md §2): the system palette is low-chroma precisely so that the marks
 * a user chose are the most saturated thing on any screen.
 */
export const COLOR_PALETTE = [
  '#4F7CAC',
  '#6A8D73',
  '#B08968',
  '#8E7DBE',
  '#5C6B73',
  '#AA6C6C',
]

/** The colour a label gets when nobody picked one. Mirrors 00011's default. */
export const DEFAULT_COLOR = '#5C6B73'

/**
 * Pick a colour: six swatches and a hex field.
 *
 * It lived inside DomainSettings until categories got a colour too (00011).
 * Two copies of a swatch row is the point at which the second one starts
 * drifting, and the whole reason both screens exist is that domains and
 * categories should be managed the same way.
 *
 * Its words are `common.color`, and both area catalogs say so in as many
 * words: neither `domains` nor `categories` describes a colour, because a
 * colour is user data — the one documented exception to the design system's
 * no-raw-colour rule. There are no colour *names* here either; a swatch is
 * named by its hex value, which is the same string in every language.
 */
export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const c = useCopy().common.color

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label ?? c.label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {COLOR_PALETTE.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={c.swatch(hex)}
            aria-pressed={value.toLowerCase() === hex.toLowerCase()}
            onClick={() => onChange(hex)}
            style={{ backgroundColor: hex }}
            className={cn(
              'size-7 rounded-full transition-shadow',
              value.toLowerCase() === hex.toLowerCase() &&
                'ring-2 ring-primary ring-offset-2 ring-offset-card',
            )}
          />
        ))}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={c.hex}
          className="h-8 w-24 font-mono text-xs"
        />
      </div>
    </div>
  )
}
