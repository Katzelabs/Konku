import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Domain } from '../../api/types'
import { DomainDot } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { COLOR_PALETTE, ColorPicker } from '../../components/ui/color-picker'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Notice } from '../../components/ui/notice'
import { Loading } from '../../components/ui/spinner'
import { cn } from '../../lib/utils'
import {
  useAllDomains,
  useArchiveDomain,
  useCreateDomain,
  useDeleteDomain,
  useUpdateDomain,
} from './queries'

/**
 * Domain management, rendered as a section of Pengaturan.
 *
 * Per-user domains made a UI for them non-optional (D-046, D-053) but they are
 * settings-shaped, not somewhere you go daily — so they live here rather than
 * taking a slot in the nav.
 */
export default function DomainSettings() {
  const { data, isPending, error } = useAllDomains()
  const [adding, setAdding] = useState(false)

  if (isPending) return <Loading />
  if (error) return <Notice>{error.message}</Notice>

  const live = (data ?? []).filter((d) => d.archivedAt === null)
  const archived = (data ?? []).filter((d) => d.archivedAt !== null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-muted-fg">
          Target mingguan cuma penanda arah, bukan setoran. Nol berarti domain ini
          tetap bisa dipakai tapi tidak ikut rotasi mingguan.
        </p>
        {!adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Tambah
          </Button>
        )}
      </div>

      {adding && <NewDomainForm onDone={() => setAdding(false)} />}

      {live.length === 0 && !adding && (
        <EmptyState
          title="Belum ada domain."
          description="Domain dipakai buat menandai catatan dan sesi fokus."
        />
      )}

      {live.length > 0 && (
        <ul className="flex flex-col gap-2">
          {live.map((d) => (
            <DomainRow key={d.id} domain={d} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-fg">Diarsipkan</h3>
          <ul className="flex flex-col gap-2">
            {archived.map((d) => (
              <DomainRow key={d.id} domain={d} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function NewDomainForm({ onDone }: { onDone: () => void }) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(COLOR_PALETTE[0])
  const [quota, setQuota] = useState(1)
  const create = useCreateDomain()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    create.mutate({ label: label.trim(), color, weeklyQuota: quota }, { onSuccess: onDone })
  }

  return (
    <Card className="border-primary-ink">
      <form onSubmit={submit} className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-domain">Nama domain</Label>
          <Input
            id="new-domain"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Pengetahuan umum"
          />
        </div>

        <ColorPicker value={color} onChange={setColor} />
        <QuotaPicker value={quota} onChange={setQuota} />

        {create.isError && <Notice>{create.error.message}</Notice>}

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={create.isPending || !label.trim()}
          >
            Simpan
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onDone}>
            Batal
          </Button>
        </div>
      </form>
    </Card>
  )
}

function DomainRow({ domain }: { domain: Domain }) {
  const [editing, setEditing] = useState(false)
  const archive = useArchiveDomain()
  const del = useDeleteDomain()
  const isArchived = domain.archivedAt !== null

  if (editing) return <EditDomainForm domain={domain} onDone={() => setEditing(false)} />

  return (
    <li>
      <Card className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <DomainDot color={domain.color} />
          <span
            className={cn(
              'flex-1 text-sm font-medium',
              isArchived ? 'text-subtle-fg' : 'text-card-fg',
            )}
          >
            {domain.label}
          </span>
          <span className="text-xs text-subtle-fg">
            {domain.weeklyQuota > 0
              ? `${domain.weeklyQuota}× / minggu`
              : 'di luar rotasi'}
          </span>
        </div>

        <div className="flex gap-3">
          {!isArchived && (
            <Button variant="link" size="inline" onClick={() => setEditing(true)}>
              Ubah
            </Button>
          )}
          <Button
            variant="link"
            size="inline"
            onClick={() => archive.mutate({ id: domain.id, archived: !isArchived })}
          >
            {isArchived ? 'Aktifkan lagi' : 'Arsipkan'}
          </Button>
          <Button variant="link" size="inline" onClick={() => del.mutate(domain.id)}>
            Hapus
          </Button>
        </div>

        {/*
          A domain in use cannot be deleted — the server answers 409 with a
          message that points at archiving (D-051). Shown as-is: it is already
          user-facing Indonesian, and it is information, not a telling-off.
        */}
        {del.isError && <Notice>{del.error.message}</Notice>}
        {archive.isError && <Notice>{archive.error.message}</Notice>}
      </Card>
    </li>
  )
}

function EditDomainForm({ domain, onDone }: { domain: Domain; onDone: () => void }) {
  const [label, setLabel] = useState(domain.label)
  const [color, setColor] = useState(domain.color)
  const [quota, setQuota] = useState(domain.weeklyQuota)
  const update = useUpdateDomain()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    update.mutate(
      { id: domain.id, label: label.trim(), color, weeklyQuota: quota },
      { onSuccess: onDone },
    )
  }

  return (
    <li>
      <Card className="border-primary-ink">
        <form onSubmit={submit} className="flex flex-col gap-4 p-4">
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Nama domain"
          />
          <ColorPicker value={color} onChange={setColor} />
          <QuotaPicker value={quota} onChange={setQuota} />

          {update.isError && <Notice>{update.error.message}</Notice>}

          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={update.isPending}>
              Simpan
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onDone}>
              Batal
            </Button>
          </div>
        </form>
      </Card>
    </li>
  )
}

function QuotaPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`quota-${value}`}>Target mingguan</Label>
      <Input
        id={`quota-${value}`}
        type="number"
        min={0}
        max={21}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24"
      />
    </div>
  )
}
