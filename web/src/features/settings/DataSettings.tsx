import { DeleteAccount } from './DeleteAccount'
import { ExportData } from './ExportData'
import { SettingsSection } from './SettingsSection'

/**
 * Everything that leaves, in both senses: the archive you can take with you
 * (07 L6) and the account you can end (07 L7).
 *
 * They share a screen on purpose. The export is the answer to the question the
 * delete raises, and someone who has decided to leave will not go looking for
 * it on another tab — it is offered inside the confirmation too, at the last
 * moment it is still possible.
 *
 * The delete sits at the bottom of the one screen you have to choose to open.
 * On the old single-column Pengaturan it was three scrolls under the email
 * address, which put an irreversible button on the path of every ordinary
 * visit.
 */
export default function DataSettings() {
  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title="Unduh datamu"
        description="Semua yang tersimpan di akun ini, dalam satu arsip."
      >
        <ExportData />
      </SettingsSection>

      <SettingsSection
        title="Hapus akun"
        description="Kalau kamu mau berhenti. Unduh datanya dulu kalau perlu."
      >
        <DeleteAccount />
      </SettingsSection>
    </div>
  )
}
