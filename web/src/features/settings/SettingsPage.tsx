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
import { useTheme, type Theme } from './useTheme'

/**
 * Settings.
 *
 * Two of these sections are real and one is deliberately thin. Domains and the
 * theme work end to end; there is no per-user *preferences* section because
 * there is nowhere to put one — progressive-focus N, the default timer
 * duration and the rota preference were constants under a single user and have
 * no table now that the model is multi-tenant (the open question in
 * DECISIONS.md). Inventing that table for a theme would have been the wrong
 * first reason to add it, so the theme lives in localStorage instead.
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
        description="Akun dibuat lewat `konku seed-user`. Tidak ada pendaftaran publik (D-039)."
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
        title="Tampilan"
        description="Tersimpan di perangkat ini, bukan di akun."
      >
        <Card className="p-5">
          <ThemePicker />
        </Card>
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
