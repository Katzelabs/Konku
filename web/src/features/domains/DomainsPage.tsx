import { useState } from 'react'
import type { Domain } from '../../api/types'
import {
  useAllDomains,
  useArchiveDomain,
  useCreateDomain,
  useDeleteDomain,
  useUpdateDomain,
} from './queries'

/** A muted starting palette. The user can type any #RRGGBB they like. */
const PALETTE = ['#4F7CAC', '#6A8D73', '#B08968', '#8E7DBE', '#5C6B73', '#AA6C6C']

export default function DomainsPage() {
  const { data, isPending, error } = useAllDomains()
  const [adding, setAdding] = useState(false)

  if (isPending) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) {
    return <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{error.message}</p>
  }

  const live = (data ?? []).filter((d) => d.archivedAt === null)
  const archived = (data ?? []).filter((d) => d.archivedAt !== null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Domain</h1>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-sm text-slate-500 underline underline-offset-4"
          >
            Tambah domain
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500">
        Target mingguan cuma penanda arah, bukan setoran. Nol berarti domain ini tetap bisa dipakai
        tapi tidak ikut rotasi mingguan.
      </p>

      {adding && <NewDomainForm onDone={() => setAdding(false)} />}

      <ul className="flex flex-col gap-2">
        {live.map((d) => (
          <DomainRow key={d.id} domain={d} />
        ))}
      </ul>

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-slate-500">Diarsipkan</h2>
          <ul className="flex flex-col gap-2">
            {archived.map((d) => (
              <DomainRow key={d.id} domain={d} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function NewDomainForm({ onDone }: { onDone: () => void }) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [quota, setQuota] = useState(1)
  const create = useCreateDomain()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    create.mutate(
      { label: label.trim(), color, weeklyQuota: quota },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Nama domain"
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <ColorPicker value={color} onChange={setColor} />
      <QuotaPicker value={quota} onChange={setQuota} />

      {create.isError && <p className="text-sm text-slate-600">{create.error.message}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || !label.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Simpan
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
        >
          Batal
        </button>
      </div>
    </form>
  )
}

function DomainRow({ domain }: { domain: Domain }) {
  const [editing, setEditing] = useState(false)
  const archive = useArchiveDomain()
  const del = useDeleteDomain()
  const isArchived = domain.archivedAt !== null

  if (editing) return <EditDomainForm domain={domain} onDone={() => setEditing(false)} />

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: domain.color }}
        />
        <span className={`flex-1 text-sm ${isArchived ? 'text-slate-400' : 'text-slate-900'}`}>
          {domain.label}
        </span>
        <span className="text-xs text-slate-400">
          {domain.weeklyQuota > 0 ? `${domain.weeklyQuota}× / minggu` : 'di luar rotasi'}
        </span>
      </div>

      <div className="flex gap-3 text-xs text-slate-500">
        {!isArchived && (
          <button onClick={() => setEditing(true)} className="underline underline-offset-4">
            Ubah
          </button>
        )}
        <button
          onClick={() => archive.mutate({ id: domain.id, archived: !isArchived })}
          className="underline underline-offset-4"
        >
          {isArchived ? 'Aktifkan lagi' : 'Arsipkan'}
        </button>
        <button onClick={() => del.mutate(domain.id)} className="underline underline-offset-4">
          Hapus
        </button>
      </div>

      {/*
        A domain in use cannot be deleted — the server answers 409 with a
        message that points at archiving (D-051). Shown as-is: it is already
        user-facing Indonesian, and it is information, not a telling-off.
      */}
      {del.isError && <p className="text-xs text-slate-600">{del.error.message}</p>}
      {archive.isError && <p className="text-xs text-slate-600">{archive.error.message}</p>}
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
    <li className="rounded-xl border border-slate-300 px-4 py-3">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <ColorPicker value={color} onChange={setColor} />
        <QuotaPicker value={quota} onChange={setQuota} />

        {update.isError && <p className="text-sm text-slate-600">{update.error.message}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Simpan
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            Batal
          </button>
        </div>
      </form>
    </li>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Warna ${c}`}
          onClick={() => onChange(c)}
          style={{ backgroundColor: c }}
          className={`h-6 w-6 rounded-full ${value === c ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
        />
      ))}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs"
      />
    </div>
  )
}

function QuotaPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      Target mingguan
      <input
        type="number"
        min={0}
        max={21}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
      />
    </label>
  )
}
