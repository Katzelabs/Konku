import type { ReactNode } from 'react'
import { ChevronRight, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PageHeader } from '../../components/ui/page-header'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useLogout, useMe } from '../auth/useAuth'
import { ActiveSessions } from './ActiveSessions'
import { DeleteAccount } from './DeleteAccount'
import { ExportData } from './ExportData'
import { useTheme, type Theme } from './useTheme'

/**
 * Settings.
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
 * the export landing.
 *
 * Not here, from the mockup and rejected in D-054: avatar upload, a display
 * name, push notification toggles, CSV export, and a daily review target.
 */
export default function SettingsPage() {
  const { data: user } = useMe()
  const logout = useLogout()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Pengaturan"
        description="Domain, tampilan, dan akun."
      />

      <Section
        title="Akun"
        description="Email dan sesi kamu."
      >
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-email">Email</Label>
            <Input
              id="settings-email"
              readOnly
              value={user?.email ?? ''}
              className="bg-muted text-muted-fg"
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium text-card-fg">Keluar</p>
              <p className="text-xs text-muted-fg">
                Sesi di perangkat ini diakhiri.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut />
              Keluar
            </Button>
          </div>
        </Card>
      </Section>

      <Section
        title="Data kamu"
        description="Semua yang tersimpan di akun ini, dalam satu arsip."
      >
        <ExportData />
      </Section>

      <Section
        title="Perangkat yang masuk"
        description="Tempat akun ini sedang dipakai. Akhiri yang tidak kamu kenali."
      >
        <ActiveSessions />
      </Section>

      <Section
        title="Tampilan"
        description="Tersimpan di perangkat ini, bukan di akun."
      >
        <Card className="p-5">
          <ThemePicker />
        </Card>
      </Section>

      <Section
        title="Hapus akun"
        description="Kalau kamu mau berhenti. Unduh datanya dulu kalau perlu."
      >
        <DeleteAccount />
      </Section>

      <Section title="Domain">
        {/*
          A link rather than the editor inline. Domain management is a page's
          worth of forms; folding it into a settings section buried the rest of
          this screen under it, and it deserves a URL you can link to.
        */}
        <Link to="/domains" className="block">
          <Card className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-card-fg">Atur domain</p>
              <p className="text-sm text-muted-fg">
                Nama, warna, target mingguan, dan arsip.
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-subtle-fg" />
          </Card>
        </Link>
      </Section>
    </div>
  )
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'system', label: 'Ikut sistem', icon: Monitor },
]

function ThemePicker() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-col gap-2">
      <Label>Tema</Label>
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
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-surface-fg">{title}</h2>
        {description && <p className="text-sm text-muted-fg">{description}</p>}
      </div>
      {children}
    </section>
  )
}
