import { Monitor, Moon, Sun } from 'lucide-react'
import { Card } from '../../components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useCopy, type Copy } from '../../i18n'
import { SettingsSection } from './SettingsSection'
import { useTheme, type Theme } from './useTheme'

/**
 * Appearance.
 *
 * The theme stays in localStorage rather than in `user_settings`, even though
 * that table now exists (07 L1). It is a property of this screen on this
 * device, not of the account — the same person on a phone at night and a
 * laptop at noon wants different answers, and syncing it would make one of
 * those wrong.
 *
 * There is still no *preferences* section for progressive-focus N, the default
 * timer duration or the rota toggle. The column exists for each; no screen
 * reads them yet, and adding one is its own task rather than a side effect of
 * this split.
 */
export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const copy = useCopy()
  const c = copy.settings.appearance

  return (
    <SettingsSection title={c.title} description={c.description}>
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm font-medium text-card-fg">{c.themeLabel}</p>
        <ToggleGroup>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem
              key={value}
              selected={theme === value}
              onClick={() => setTheme(value)}
              className="inline-flex items-center gap-2"
            >
              <Icon className="size-4" />
              {label(copy)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Card>
    </SettingsSection>
  )
}

/**
 * The three options, in order. A module-level table rather than three inlined
 * items, so the value, the word and the icon stay together — and the word is a
 * selector over the catalog for the same reason `nav.ts` uses one: a table at
 * module scope is built once, before any locale exists (11 I5).
 */
const THEMES: { value: Theme; label: (c: Copy) => string; icon: typeof Sun }[] = [
  { value: 'light', label: (c) => c.settings.appearance.themes.light, icon: Sun },
  { value: 'dark', label: (c) => c.settings.appearance.themes.dark, icon: Moon },
  { value: 'system', label: (c) => c.settings.appearance.themes.system, icon: Monitor },
]
