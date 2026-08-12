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
        description="Nama, email, dan sesi kamu."
      >
        <Card className="flex flex-col gap-4 p-5">
          {/*
            Read-only, both of them. Nothing in the app changes a name or an
            address yet — signup is the only writer (00010) — and an editable
            box that silently discards what you type is worse than one that
            says it cannot be changed by looking like it.
          */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-name">Nama</Label>
            <Input
              id="settings-name"
              readOnly
              // Blank for an account created before signup asked, rather than
              // repeating the address in a field labelled "Nama".
              value={user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : ''}
              placeholder="Belum diisi"
              className="bg-muted text-muted-fg"
            />
          </div>

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
            {/*
              Secondary, not destructive, and deliberately unlike the account
              menu's red item. Here "Keluar" sits above the delete-account
              block, where red is spoken for by something irreversible — two
              red buttons in one column would flatten the difference between
              ending a session and destroying an account.
            */}
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

      <Section title="Tentang">
        <Card className="flex flex-col gap-3 p-5 text-sm">
          <p className="text-secondary-fg">
            Konku menyimpan apa yang kamu tulis dan alamat email kamu. Tidak dijual,
            tidak dipakai untuk iklan, tidak dipakai melatih model AI.
          </p>
          <p className="text-muted-fg">
            <Link
              to="/privacy"
              className="text-surface-fg underline underline-offset-4"
            >
              Kebijakan Privasi
            </Link>
            {' · '}
            <Link to="/terms" className="text-surface-fg underline underline-offset-4">
              Ketentuan Layanan
            </Link>
          </p>
        </Card>
      </Section>

      <Section
        title="Label"
        description="Dua cara menandai catatan dan kartu: satu domain, banyak kategori."
      >
        {/*
          Links rather than the editors inline. Each is a page's worth of forms;
          folding them into a settings section buried the rest of this screen
          under them, and both deserve a URL you can link to.

          Categories sit beside domains rather than under them. They are not a
          sub-setting of a domain — they are the other half of the same job, and
          until 00011 they were the half with no screen at all.
        */}
        <div className="flex flex-col gap-2">
          <SettingsLink
            to="/domains"
            title="Atur domain"
            description="Nama, warna, target mingguan, dan arsip."
          />
          <SettingsLink
            to="/categories"
            title="Atur kategori"
            description="Ganti nama, warna, arsipkan, atau hapus yang tidak terpakai."
          />
        </div>
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

/** A settings row that goes somewhere: title, one line of what is there, chevron. */
function SettingsLink({
  to,
  title,
  description,
}: {
  to: string
  title: string
  description: string
}) {
  return (
    <Link to={to} className="block">
      <Card className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-card-fg">{title}</p>
          <p className="text-sm text-muted-fg">{description}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-subtle-fg" />
      </Card>
    </Link>
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
