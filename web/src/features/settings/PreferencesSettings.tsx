import { Card } from '../../components/ui/card'
import { Notice } from '../../components/ui/notice'
import { Loading } from '../../components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { LOCALES, useCopy, type Locale } from '../../i18n'
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
 * **Only language and the timer default have controls, and that is on
 * purpose.** The other two columns are real and round-trip correctly, but the
 * features they belong to are not built: `focusStepN` is D-037's progressive
 * focus, still to be tuned against per-account data, and `rotaEnabled` is the
 * weekly domain rota. Putting switches here for either would be shipping a
 * control that changes nothing, which is worse than the unread column it was
 * meant to fix.
 *
 * **Language is here rather than on Tampilan** (00014, ticket 11 I2). The line
 * `nav.ts` draws between these two screens is where the value is stored: this
 * one is the account and travels, Tampilan is this device and does not, and
 * both screens say so in their own description. The locale is a `user_settings`
 * column that the export carries, so putting it on the screen that promises
 * per-device storage would make that promise untrue.
 *
 * Saved on selection rather than behind a Save button. One field, one tap,
 * instantly reversible — a form ceremony around that is friction for its own
 * sake, and capture cost is the thing to protect (hard rule 7).
 */
export default function PreferencesSettings() {
  const { data: settings, isPending, isError } = useSettings()
  const update = useUpdateSettings()
  const c = useCopy()

  return (
    <SettingsSection
      title={c.settings.preferences.title}
      description={c.settings.preferences.description}
    >
      {/*
        Language sits above the timer default because it is the setting that
        changes every other word on this screen, including the one below it.
      */}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-card-fg">{c.settings.language.title}</p>
          <p className="text-sm text-muted-fg">{c.settings.language.description}</p>
        </div>

        {settings && (
          <ToggleGroup>
            {/*
              `null` is a real option and it is first: it is what the account
              starts on, and it means "follow the browser" rather than "no
              answer". Without it on screen a person who tried English could
              never get back, and the control would show a value that is not
              what is stored (D-094's resolution order made visible).
            */}
            <ToggleGroupItem
              selected={settings.locale === null}
              disabled={update.isPending}
              onClick={() => update.mutate({ ...settings, locale: null })}
            >
              {c.settings.language.auto}
            </ToggleGroupItem>

            {LOCALES.map((locale) => (
              <ToggleGroupItem
                key={locale}
                selected={settings.locale === locale}
                disabled={update.isPending}
                onClick={() => update.mutate({ ...settings, locale })}
              >
                {LANGUAGE_NAMES[locale]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-card-fg">
            {c.settings.preferences.focusDuration.title}
          </p>
          <p className="text-sm text-muted-fg">
            {c.settings.preferences.focusDuration.description}
          </p>
        </div>

        {isPending && <Loading label={c.settings.preferences.loading} />}

        {isError && <Notice role="alert">{c.settings.preferences.loadError}</Notice>}

        {settings && (
          <ToggleGroup>
            {DURATIONS.map((minutes) => (
              <ToggleGroupItem
                key={minutes}
                selected={settings.defaultDurationMinutes === minutes}
                disabled={update.isPending}
                onClick={() => update.mutate({ ...settings, defaultDurationMinutes: minutes })}
              >
                {c.settings.preferences.focusDuration.minutes(minutes)}
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

/**
 * Each language named in itself, which is what a language picker does: someone
 * looking for English has to be able to find it while the screen is still in
 * Indonesian, and vice versa.
 *
 * Not catalog keys, and that is the point — these read identically in both
 * catalogs, so keying them would be two copies of the same word kept in step
 * for nothing.
 */
// i18n-exempt: endonyms — a language is named in its own language, in both catalogs
const LANGUAGE_NAMES: Record<Locale, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
}
