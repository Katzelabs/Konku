import { LogOut } from 'lucide-react'
import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import { displayName, initialsFor } from '../auth/displayName'
import { useLogout, useMe } from '../auth/useAuth'
import { ChangePassword } from './ChangePassword'
import { SettingsField, SettingsRow, SettingsSection } from './SettingsSection'

/**
 * Who is signed in, and how to stop being.
 *
 * The name and the address are read-only, and they are read-only *text* now
 * rather than disabled `<Input>`s. Nothing in the app changes either yet —
 * signup is the only writer (00010) — and a greyed-out box still looks like a
 * box you could type in, which is a promise the screen cannot keep. A line
 * under them says so outright instead of leaving it to be inferred from a
 * cursor that will not appear.
 */
export default function AccountSettings() {
  const { data: user } = useMe()
  const logout = useLogout()

  /*
   * `displayName` falls back to the address, so an account with no name has
   * the same string in the heading and in the Email row. The account menu
   * already made this call and made it the same way: the address is the
   * heading when there is nothing else to be, and repeating it underneath is
   * the screen stuttering.
   */
  const named = user ? displayName(user) !== user.email : false

  return (
    <SettingsSection
      title="Profil"
      description="Akun ini dan kata sandinya. Nama dan email belum bisa diubah dari sini."
    >
      <Card className="flex flex-col gap-5 p-5">
        {user && (
          <div className="flex items-center gap-3">
            <Avatar initials={initialsFor(user)} className="size-11 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-card-fg">
                {displayName(user)}
              </p>
              <p className="text-xs text-muted-fg">
                {user.emailVerified ? 'Email terverifikasi' : 'Email belum diverifikasi'}
              </p>
            </div>
          </div>
        )}

        <Separator />

        <dl className="flex flex-col gap-3">
          <SettingsField
            label="Nama"
            value={user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : ''}
          />
          {named && <SettingsField label="Email" value={user?.email ?? ''} empty="—" />}
        </dl>
      </Card>

      {/*
        The one thing on this screen that is editable, which is why it sits
        directly under the read-only pair rather than with the session controls
        on /settings/perangkat. It is a property of the account, not of a
        device — the devices are what it signs out.
      */}
      <ChangePassword />

      {/*
        Red as an outline, and only as an outline.

        This row used to be plain `secondary`, which made ending a session look
        exactly like "Ubah kata sandi" two cards above it — the one control on
        the screen that throws away what you are in the middle of, drawn like
        the ones that do not. The account menu had already settled this: its
        Keluar item is the only red thing in a list of grey ones, for the same
        reason.

        What has not changed is the ceiling. The filled red and the tinted
        panel belong to /settings/data, where the thing being ended is the
        account rather than the session. Ending a session and destroying an
        account must not look like the same weight of decision (D-054) — so
        they are now two weights of the same colour instead of two colours.
      */}
      <Card className="border-destructive/25 p-5">
        <SettingsRow
          title="Keluar dari perangkat ini"
          description="Sesi di perangkat ini diakhiri. Perangkat lain tetap masuk, dan kamu bisa masuk lagi kapan saja."
          action={
            <Button
              variant="destructive-outline"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut />
              Keluar
            </Button>
          }
        />
      </Card>
    </SettingsSection>
  )
}
