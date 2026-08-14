import { Card } from '../../components/ui/card'
import { Notice } from '../../components/ui/notice'
import { Loading } from '../../components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { DURATIONS } from '../timer/useTimer'
import { SettingsSection } from './SettingsSection'
import { useSettings, useUpdateSettings } from './useSettings'

/**
 * Preferences that belong to the account rather than to this device.
 *
 * `user_settings` has existed since migration 00007 — signup writes a row and
 * the export carries it — and nothing read it. A table with no behaviour is
 * what later gets a half-finished endpoint bolted onto it, so this is the
 * screen that gives it one.
 *
 * **Only the timer default has a control, and that is on purpose.** The other
 * two columns are real and round-trip correctly, but the features they belong
 * to are not built: `focusStepN` is D-037's progressive focus, still to be
 * tuned against per-account data, and `rotaEnabled` is the weekly domain rota.
 * Putting switches here for either would be shipping a control that changes
 * nothing, which is worse than the unread column it was meant to fix.
 *
 * Saved on selection rather than behind a Save button. One field, one tap,
 * instantly reversible — a form ceremony around that is friction for its own
 * sake, and capture cost is the thing to protect (hard rule 7).
 */
export default function PreferencesSettings() {
  const { data: settings, isPending, isError } = useSettings()
  const update = useUpdateSettings()

  return (
    <SettingsSection
      title="Preferensi"
      description="Tersimpan di akun, jadi ikut ke perangkat lain. Tema diatur terpisah di Tampilan karena itu milik perangkat ini."
    >
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-card-fg">Durasi fokus default</p>
          <p className="text-sm text-muted-fg">
            Timer terbuka dengan durasi ini. Kamu tetap bisa menggantinya sebelum
            memulai sesi.
          </p>
        </div>

        {isPending && <Loading label="Memuat preferensi…" />}

        {isError && (
          <Notice role="alert">
            Pengaturan belum bisa dimuat. Coba muat ulang halaman ini ya.
          </Notice>
        )}

        {settings && (
          <ToggleGroup>
            {DURATIONS.map((minutes) => (
              <ToggleGroupItem
                key={minutes}
                selected={settings.defaultDurationMinutes === minutes}
                disabled={update.isPending}
                onClick={() => update.mutate({ ...settings, defaultDurationMinutes: minutes })}
              >
                {minutes} menit
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}

        {/*
          A failed save has to say so. The toggle reflects the cached value,
          which on failure is still the old one — so without this the screen
          would show the previous choice and look like nothing was pressed.
        */}
        {update.isError && <Notice role="alert">{update.error.message}</Notice>}
      </Card>
    </SettingsSection>
  )
}
