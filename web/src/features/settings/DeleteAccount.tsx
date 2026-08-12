import { useState, type FormEvent } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Notice } from '../../components/ui/notice'
import { useDeleteAccount } from '../auth/useAuth'

/**
 * Delete the account (07 L7).
 *
 * The export is offered inside the confirmation, not merely somewhere else on
 * the page. Someone who has decided to leave will not go looking for it, and
 * the one moment they might still want it is the moment before it is gone.
 *
 * The copy is direct about permanence and stops there. Hard rule 6 rules out
 * punitive tone, and that holds here too: the honest thing is to say plainly
 * that this cannot be undone, not to make somebody feel bad for leaving. No
 * "are you really sure", no guilt, no list of what they will miss.
 *
 * This is also the one screen in the app where a red destructive treatment is
 * right — the palette has a `destructive` token for exactly this, and a delete
 * that cannot be undone is the case it was reserved for (D-054).
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const del = useDeleteAccount()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    del.mutate(password)
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Never leave a password sitting in state behind a closed dialog.
      setPassword('')
      del.reset()
    }
  }

  return (
    <>
      <Card className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-card-fg">Hapus akun</p>
          <p className="text-xs text-muted-fg">
            Semua catatan, kartu, dan riwayat review ikut terhapus. Tidak bisa
            dikembalikan.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Trash2 />
          Hapus akun
        </Button>
      </Card>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Hapus akun</DialogTitle>
              <DialogDescription>
                Catatan, kartu, jadwal ulang, riwayat ulangan, sesi fokus, dan latihan
                kamu akan dihapus permanen. Ini tidak bisa dibatalkan.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              {/*
                Offered here, at the last moment it is still possible. Someone
                who has decided to leave will not go hunting for it first.
              */}
              <Card className="flex items-center justify-between gap-3 p-4">
                <p className="text-sm text-secondary-fg">
                  Mau simpan salinannya dulu?
                </p>
                <Button asChild variant="secondary" size="sm">
                  <a href="/api/export" download>
                    <Download />
                    Unduh
                  </a>
                </Button>
              </Card>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="delete-password">
                  Masukkan kata sandi untuk mengonfirmasi
                </Label>
                <Input
                  id="delete-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {del.isError && <Notice role="alert">{del.error.message}</Notice>}
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={del.isPending}
              >
                Batal
              </Button>
              <Button type="submit" variant="destructive" disabled={del.isPending}>
                {del.isPending ? 'Menghapus…' : 'Hapus akun saya'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
