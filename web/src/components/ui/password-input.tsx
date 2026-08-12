import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Input } from './input'

/**
 * A password field you can read back.
 *
 * The case for the toggle is capture cost (hard rule 7) pointed at the one
 * form nobody enjoys: the app asks for twelve characters and recommends a
 * passphrase, and a passphrase is exactly the kind of thing that gets mistyped
 * in a field showing only dots. Without a reveal, the recovery from one wrong
 * character is to clear the field and type the whole thing again.
 *
 * It starts hidden, always. Shoulder-surfing is the reason the dots exist, and
 * defaulting to visible would trade a real protection for a convenience the
 * user can have in one click anyway. The state is per-mount and never
 * persisted, so a reveal on one screen does not follow you to the next.
 *
 * `type` flips between password and text, which is the only approach that
 * actually works — there is no CSS that un-masks a password input. The cost is
 * that some password managers stop offering to fill a revealed field, which is
 * a good reason not to start revealed and no reason to omit the button.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        // Room for the button, so a long value scrolls under the label rather
        // than behind the icon.
        className={cn('pr-10', className)}
      />
      <button
        type="button"
        // Not a <Button>: this sits inside the input's box and takes none of
        // the variants' padding, height or background. Wearing `ghost` here
        // would mean fighting every one of them with an override.
        onClick={() => setVisible((v) => !v)}
        // Both, and they say the action rather than the state. A control
        // labelled "Kata sandi terlihat" reads as a status; the label has to
        // answer "what happens if I press this".
        aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
        title={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
        // The state, for anything that wants it — announced as pressed or not
        // rather than by the label changing underneath the reader.
        aria-pressed={visible}
        // Skipped by Tab. The natural path through this form is field, field,
        // submit; a stop between the password and the next field would be in
        // the way of everyone who never wants to look at what they typed.
        // Still reachable by click, and by a screen reader's own navigation.
        tabIndex={-1}
        className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-subtle-fg transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet) hover:bg-muted hover:text-surface-fg"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  )
}
