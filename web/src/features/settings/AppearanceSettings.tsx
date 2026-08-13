import { Monitor, Moon, Sun } from 'lucide-react'
import { Card } from '../../components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
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

  return (
    <SettingsSection
      title="Tampilan"
      description="Tersimpan di perangkat ini, bukan di akun. Perangkat lain tidak ikut berubah."
    >
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm font-medium text-card-fg">Tema</p>
        <ToggleGroup>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem
              key={value}
              selected={theme === value}
              onClick={() => setTheme(value)}
              className="inline-flex items-center gap-2"
            >
              <Icon className="size-4" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Card>
    </SettingsSection>
  )
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'system', label: 'Ikut sistem', icon: Monitor },
]
