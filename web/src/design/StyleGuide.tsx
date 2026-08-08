import { useEffect, useState } from 'react'
import type { Domain } from '../api/types'
import { Folder, LogOut, Moon, Plus, Settings, Sun, Trash2 } from 'lucide-react'
import { Avatar } from '../components/ui/avatar'
import { Badge, DomainBadge, DomainDot } from '../components/ui/badge'
import { CategoryChip } from '../components/ui/category'
import { Checkbox } from '../components/ui/checkbox'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { Markdown } from '../components/ui/markdown'
import { SelectionBar } from '../components/ui/selection-bar'
import { PropertyBar, PropertyRow, DomainProperty } from '../components/ui/property'
import { ViewToggle, type ViewMode } from '../components/ui/view-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import { EmptyState } from '../components/ui/empty-state'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Notice } from '../components/ui/notice'
import { PageHeader } from '../components/ui/page-header'
import { Separator } from '../components/ui/separator'
import { Loading } from '../components/ui/spinner'
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group'

/**
 * Living style guide, dev-only (see main.tsx). Open http://localhost:5173/design.
 *
 * Every token and every component variant renders here. If a screen needs
 * something this page does not show, that is the signal to add it to the
 * system rather than to hand-roll it in a feature folder.
 */
export default function StyleGuide() {
  const [dark, setDark] = useState(false)
  const [duration, setDuration] = useState(20)
  const [view, setView] = useState<ViewMode>('list')
  const [checked, setChecked] = useState(true)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])

  return (
    <div className="min-h-dvh bg-surface px-gutter py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <PageHeader
          title="Konku design system"
          description="Tokens dan komponen. Semua warna di app harus berasal dari halaman ini."
          actions={
            <Button variant="secondary" onClick={() => setDark((d) => !d)}>
              {dark ? <Sun /> : <Moon />}
              {dark ? 'Light' : 'Dark'}
            </Button>
          }
        />

        <Section title="Colour" hint="Semantic names only. Never bg-slate-900.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {SURFACES.map((s) => (
              <Swatch key={s.name} {...s} />
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-fg">
            There is no <code className="font-mono text-xs">success</code> token
            and no green. Nothing in this product is a pass or a fail —{' '}
            <code className="font-mono text-xs">destructive</code> is reserved
            for deleting data, never for a review outcome (hard rule 6).
          </p>
        </Section>

        <Section title="Type" hint="Geist. UI at 14px, prose at 17px/1.7.">
          <div className="flex flex-col gap-3">
            <p className="text-2xl font-bold tracking-tight">
              Judul halaman — 24px bold
            </p>
            <p className="text-base font-semibold">Judul kartu — 16px semibold</p>
            <p className="text-sm">Teks antarmuka — 14px regular</p>
            <p className="text-sm text-muted-fg">Teks sekunder — 14px muted</p>
            <p className="text-xs text-subtle-fg">
              Metadata, tanggal, hitungan — 12px subtle
            </p>
            <Separator className="my-2" />
            <p className="max-w-reading-measure text-reading text-reading-fg">
              Badan catatan pakai <code className="font-mono text-sm">text-reading</code>{' '}
              — 17px dengan line-height 1.7 dan warna yang sedikit lebih lembut
              dari judul. Ini teks yang memang dibuat untuk dibaca lama, bukan
              dipindai sekilas.
            </p>
            <p className="font-mono text-sm">
              Geist Mono — Tanya :: Jawab
            </p>
          </div>
        </Section>

        <Section title="Radius & elevation" hint="Border-first. Shadows only float.">
          <div className="flex flex-wrap items-end gap-4">
            {RADII.map((r) => (
              <div key={r.cls} className="flex flex-col items-center gap-2">
                <div
                  className={`size-16 border border-border bg-card ${r.cls}`}
                />
                <span className="font-mono text-xs text-subtle-fg">
                  {r.cls}
                </span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-2">
              <div className="size-16 rounded-lg bg-card shadow-float" />
              <span className="font-mono text-xs text-subtle-fg">
                shadow-float
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="size-16 rounded-xl bg-card shadow-dialog" />
              <span className="font-mono text-xs text-subtle-fg">
                shadow-dialog
              </span>
            </div>
          </div>
        </Section>

        <Section title="Button">
          <div className="flex flex-col gap-4">
            <Row label="variant">
              <Button variant="primary">Simpan</Button>
              <Button variant="secondary">Batal</Button>
              <Button variant="ghost">Ubah</Button>
              <Button variant="accent">Terpilih</Button>
              <Button variant="destructive">
                <Trash2 />
                Hapus
              </Button>
              <Button variant="link" size="inline">
                Lihat catatan asal
              </Button>
            </Row>
            <Row label="size">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Tambah">
                <Plus />
              </Button>
            </Row>
            <Row label="state">
              <Button variant="primary" disabled>
                Disabled
              </Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
            </Row>
            <Row label="review">
              {/*
                The two SRS answers, exactly as they must appear: both ordinary,
                neither red. Forgetting is the case the scheduler is built
                around, not a mistake (D-054).
              */}
              <Button variant="secondary" className="w-40">
                Belum ingat
              </Button>
              <Button variant="primary" className="w-40">
                Ingat
              </Button>
            </Row>
          </div>
        </Section>

        <Section title="Form">
          <div className="flex max-w-md flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sg-email">Email</Label>
              <Input id="sg-email" placeholder="kamu@contoh.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sg-note">Catatan</Label>
              <Textarea
                id="sg-note"
                rows={4}
                placeholder="Tulis kartu dengan format Tanya :: Jawab"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sg-switch">Ikut rotasi mingguan</Label>
              <Switch id="sg-switch" defaultChecked />
            </div>

            {/*
              A native input under a styled box — no Radix. All three states,
              because the indeterminate one is the reason a select-all box can
              be honest about a partial selection instead of guessing.
            */}
            <div className="flex flex-col gap-2">
              <Label>Checkbox</Label>
              <div className="flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-fg">
                  <Checkbox
                    checked={checked}
                    onChange={() => setChecked((v) => !v)}
                  />
                  Dipilih
                </label>
                <span className="flex items-center gap-2 text-sm text-muted-fg">
                  <Checkbox checked={false} indeterminate readOnly />
                  Sebagian
                </span>
                <span className="flex items-center gap-2 text-sm text-subtle-fg">
                  <Checkbox checked={false} disabled readOnly />
                  Disabled
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sg-disabled">Disabled</Label>
              <Input id="sg-disabled" disabled defaultValue="Tidak bisa diubah" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Durasi</Label>
              <ToggleGroup>
                {[15, 20, 25, 30, 45].map((m) => (
                  <ToggleGroupItem
                    key={m}
                    selected={m === duration}
                    onClick={() => setDuration(m)}
                  >
                    {m} menit
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </Section>

        <Section title="Card">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Aljabar Linear</CardTitle>
                <CardDescription>Terakhir diubah 2 hari lalu</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-reading-fg">
                  Vektor eigen dan nilai eigen. Determinan sebagai faktor skala.
                </p>
              </CardContent>
              <CardFooter>
                <DomainBadge color="#4F7CAC" label="Matematika" />
                <span className="text-xs text-subtle-fg">4 kartu</span>
              </CardFooter>
            </Card>
            <Card className="border-primary bg-accent">
              <CardHeader>
                <CardTitle className="text-accent-fg">Terpilih</CardTitle>
                <CardDescription className="text-accent-fg/70">
                  Baris yang sedang dibuka
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-accent-fg/80">
                  Item aktif pakai <code className="font-mono text-xs">bg-accent</code>.
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Badge & domain">
          <Row label="badge">
            <Badge>Netral</Badge>
            <Badge variant="accent">Aktif</Badge>
            <Badge variant="outline">Outline</Badge>
          </Row>
          <Row label="domain">
            {DOMAINS.map((d) => (
              <DomainBadge key={d.label} color={d.color} label={d.label} />
            ))}
          </Row>
          <Row label="dot">
            {DOMAINS.map((d) => (
              <DomainDot key={d.label} color={d.color} />
            ))}
          </Row>
          <p className="mt-2 text-sm text-muted-fg">
            Warna domain adalah data user, bukan token. Palet sistem sengaja
            low-chroma supaya titik-titik ini jadi hal paling berwarna di layar.
          </p>
        </Section>

        <Section
          title="Category"
          hint="Shared by notes and cards. Neutral on purpose — domain colour is the only colour signal in a row."
        >
          <Row label="chip">
            <CategoryChip label="Probabilitas" />
            <CategoryChip label="Aljabar linear" />
            <CategoryChip label="math/statistik" />
          </Row>
          <Row label="removable">
            <CategoryChip label="Bisa dihapus" onRemove={() => {}} />
          </Row>
        </Section>

        <Section
          title="View toggle"
          hint="Grid or list, for the notes and cards indexes. State lives in ?view=."
        >
          <Row label="toggle">
            <ViewToggle mode={view} onChange={setView} />
          </Row>
        </Section>

        <Section
          title="Properties"
          hint="Above an item's title, not in a drawer. Borderless — a row of boxed fields above a title reads as a form to fill in before you may write."
        >
          <div className="max-w-lg rounded-lg border border-border bg-card p-4">
            <PropertyBar>
              <PropertyRow icon={<Folder className="size-3.5" />} label="Domain">
                <DomainProperty
                  domains={STYLE_GUIDE_DOMAINS}
                  value={STYLE_GUIDE_DOMAINS[0].id}
                  onChange={() => {}}
                />
              </PropertyRow>
            </PropertyBar>
          </div>
        </Section>

        <Section
          title="Markdown"
          hint="react-markdown, mapped element by element to tokens. Never innerHTML."
        >
          <Markdown>{MARKDOWN_SAMPLE}</Markdown>
        </Section>

        <Section title="States" hint="Loading, empty, and messages.">
          <div className="flex flex-col gap-4">
            <Loading />
            <Notice>Tidak bisa menghubungi server. Coba muat ulang halaman.</Notice>
            <Notice variant="destructive">
              Catatan ini akan dihapus permanen.
            </Notice>
            <EmptyState
              title="Belum ada catatan"
              description="Catatan pertama bisa sependek satu kalimat. Kartu bisa ditambahkan kapan saja setelahnya."
              action={
                <Button variant="primary" size="sm">
                  <Plus />
                  Catatan baru
                </Button>
              }
            />
            <EmptyState
              title="Tidak ada yang perlu diulang hari ini."
              description="Sisanya besok."
            />
          </div>
        </Section>

        <Section title="Dialog" hint="Radix: focus trap, Escape, scroll lock.">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Buka dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Simpan sesi</DialogTitle>
                <DialogDescription>
                  Sesi 20 menit selesai. Mau catat sesuatu sebelum lanjut?
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Textarea rows={4} placeholder="Apa yang barusan dipelajari?" />
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Lewati</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="primary">Simpan</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>

        <Section
          title="Selection"
          hint="Ticking rows on a list, and confirming what it removes."
        >
          <Row label="bar">
            <SelectionBar
              count={3}
              allSelected={false}
              onToggleAll={() => {}}
              onClear={() => {}}
              className="w-full"
            >
              <Button variant="destructive" size="sm">
                <Trash2 />
                Hapus
              </Button>
            </SelectionBar>
          </Row>

          {/*
            The confirm reads as information, not a threat: deleting is soft on
            both notes and cards, so the description says where the thing goes
            rather than warning that it is gone (hard rule 6).
          */}
          <Row label="confirm">
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Buka konfirmasi
            </Button>
            <ConfirmDialog
              open={confirming}
              onOpenChange={setConfirming}
              title="Hapus 3 catatan?"
              description="Catatan pindah ke Terhapus beserta kategorinya, dan bisa dikembalikan kapan saja."
              confirmLabel="Hapus"
              onConfirm={() => setConfirming(false)}
            />
          </Row>
        </Section>

        <Section title="Account" hint="Initials, not a photo — there is no name field.">
          <Row label="avatar">
            <Avatar email="zidan.hafiz@contoh.com" />
            <Avatar email="konku@contoh.com" />
          </Row>
          <Row label="menu">
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full">
                <Avatar email="zidan.hafiz@contoh.com" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>zidan.hafiz@contoh.com</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Settings />
                  Pengaturan
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <LogOut />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Row>
        </Section>

        <Section
          title="Focus surface"
          hint="The timer pill. Dark on light, light on dark."
        >
          <div className="inline-flex w-fit items-center gap-3 rounded-xl bg-focus px-4 py-3 text-focus-fg shadow-float">
            <span className="font-mono text-xl font-semibold tabular-nums">
              20:00
            </span>
            <span className="text-xs tracking-wide text-focus-muted-fg uppercase">
              Sesi fokus
            </span>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 border-b border-border pb-2">
        <h2 className="text-sm font-semibold tracking-wide text-surface-fg uppercase">
          {title}
        </h2>
        {hint && <p className="text-xs text-subtle-fg">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-16 shrink-0 font-mono text-xs text-subtle-fg">
        {label}
      </span>
      {children}
    </div>
  )
}

function Swatch({ name, cls, note }: { name: string; cls: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`h-14 rounded-md border border-border ${cls}`} />
      <div className="flex flex-col">
        <span className="font-mono text-xs text-surface-fg">{name}</span>
        {note && <span className="text-xs text-subtle-fg">{note}</span>}
      </div>
    </div>
  )
}

const SURFACES = [
  { name: 'surface', cls: 'bg-surface', note: 'page' },
  { name: 'card', cls: 'bg-card', note: 'panels' },
  { name: 'muted', cls: 'bg-muted', note: 'quiet fills' },
  { name: 'accent', cls: 'bg-accent', note: 'selected' },
  { name: 'primary', cls: 'bg-primary', note: 'one per screen' },
  { name: 'focus', cls: 'bg-focus', note: 'timer' },
  { name: 'border', cls: 'bg-border', note: 'lines' },
  { name: 'destructive', cls: 'bg-destructive', note: 'delete only' },
]

const MARKDOWN_SAMPLE = `## Teorema Bayes

Prior adalah **keyakinan awal** sebelum melihat data.

- poin pertama
- poin kedua dengan \`kode inline\`

> Kutipan tenang, bukan peringatan.

| Istilah | Arti |
|---|---|
| prior | keyakinan awal |
| posterior | setelah data |

\`\`\`python
posterior = prior * likelihood / evidence
\`\`\`
`

const RADII = [
  { cls: 'rounded-sm' },
  { cls: 'rounded-md' },
  { cls: 'rounded-lg' },
  { cls: 'rounded-xl' },
  { cls: 'rounded-full' },
]

/** The starting palette from DomainsPage — user data, shown here for contrast. */
const DOMAINS = [
  { label: 'Pengetahuan umum', color: '#4F7CAC' },
  { label: 'Matematika', color: '#6A8D73' },
  { label: 'Psikologi', color: '#B08968' },
  { label: 'Musik', color: '#8E7DBE' },
]

/** A typed fixture for DomainProperty, which takes real Domain rows. */
const STYLE_GUIDE_DOMAINS: Domain[] = DOMAINS.map((d, i) => ({
  id: `sg-${i}`,
  slug: `sg-${i}`,
  label: d.label,
  color: d.color,
  weeklyQuota: 0,
  sortOrder: i,
  archivedAt: null,
}))
