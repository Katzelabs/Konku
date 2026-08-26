import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Field } from '../../components/ui/field'
import { Notice } from '../../components/ui/notice'
import { PasswordInput } from '../../components/ui/password-input'
import { useCopy } from '../../i18n'
import { useZodForm } from '../../lib/useZodForm'
import { MIN_PASSWORD, changePasswordSchema } from '../auth/schemas'
import { useChangePassword } from '../auth/useAuth'
import { SettingsRow } from './SettingsSection'

/**
 * Change the password without going through the mailbox.
 *
 * Until this existed the only route to a new password was the forgot-password
 * link, which means someone who merely suspects theirs is compromised had to go
 * via their inbox — and on an instance with no SMTP configured could not do it
 * at all.
 *
 * A dialog rather than an inline form, matching `DeleteAccount`: three password
 * fields sitting open on the profile screen is a lot of weight for something
 * done once a year, and the trigger states what it is for.
 *
 * **Not destructive.** No red, no "are you sure". Tightening your own security
 * is the opposite of the irreversible act red is reserved for (D-054), and the
 * copy says what happens to the other devices rather than warning about it.
 */
export function ChangePassword() {
  const [open, setOpen] = useState(false)
  const change = useChangePassword()
  const copy = useCopy()
  const c = copy.settings.password

  const form = useZodForm(changePasswordSchema, {
    currentPassword: '',
    password: '',
    confirmPassword: '',
  })

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Never leave passwords sitting in state behind a closed dialog — the
      // same reason DeleteAccount clears its field.
      form.reset()
      change.reset()
    }
  }

  return (
    <>
      <Card className="p-5">
        <SettingsRow
          title={c.title}
          description={c.rowDescription}
          action={
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              <KeyRound />
              {c.action}
            </Button>
          }
        />
      </Card>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={form.handleSubmit(({ currentPassword, password }) =>
              change.mutate(
                { currentPassword, newPassword: password },
                {
                  onSuccess: () => {
                    // Closed on success rather than left showing a tick: the
                    // confirmation belongs on the screen underneath, which is
                    // where the sessions list has just changed too.
                    setOpen(false)
                    form.reset()
                  },
                },
              ),
            )}
            noValidate
          >
            <DialogHeader>
              <DialogTitle>{c.title}</DialogTitle>
              <DialogDescription>{c.dialogDescription}</DialogDescription>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              <Field
                id="currentPassword"
                label={c.currentLabel}
                error={form.errors.currentPassword}
              >
                {(a11y) => (
                  <PasswordInput
                    {...a11y}
                    {...form.field('currentPassword')}
                    autoComplete="current-password"
                    required
                    autoFocus
                  />
                )}
              </Field>

              <Field
                id="password"
                label={c.newLabel}
                error={form.errors.password}
                hint={c.newHint(MIN_PASSWORD)}
              >
                {(a11y) => (
                  <PasswordInput
                    {...a11y}
                    {...form.field('password')}
                    autoComplete="new-password"
                    required
                  />
                )}
              </Field>

              <Field
                id="confirmPassword"
                label={c.confirmLabel}
                error={form.errors.confirmPassword}
              >
                {(a11y) => (
                  <PasswordInput
                    {...a11y}
                    {...form.field('confirmPassword')}
                    placeholder={c.confirmPlaceholder}
                    autoComplete="new-password"
                    required
                  />
                )}
              </Field>

              {change.isError && <Notice role="alert">{change.error.message}</Notice>}
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={change.isPending}
              >
                {copy.settings.cancel}
              </Button>
              <Button type="submit" variant="primary" disabled={change.isPending}>
                {change.isPending ? c.saving : c.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
