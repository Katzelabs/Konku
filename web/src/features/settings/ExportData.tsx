import { Download } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { SettingsRow } from './SettingsSection'

/**
 * Download everything (07 L6).
 *
 * A plain anchor, not a fetch-and-blob. The archive is a file, the browser
 * already knows how to download one, and doing it through JavaScript would
 * mean holding the whole thing in memory to hand it back to the browser
 * anyway — and losing the progress indicator the browser gives for free.
 *
 * `download` is honoured because the response is same-origin; the server's
 * Content-Disposition supplies the dated filename, so there is nothing to keep
 * in sync here.
 */
export function ExportData() {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <p className="text-sm text-secondary-fg">
          Catatan dan kartu sebagai file markdown biasa, sisanya JSON — jadwal ulang,
          riwayat ulangan, sesi fokus, domain, kategori, dan latihan tersimpan.
        </p>
        <p className="mt-2 text-sm text-muted-fg">
          Bisa dibuka di Obsidian atau editor teks apa pun. Tidak ada yang dikunci di
          format khusus.
        </p>
      </div>

      <SettingsRow
        className="border-t border-border pt-4"
        title="Unduh arsip"
        description="Kata sandi dan sesi login tidak ikut diunduh."
        action={
          /*
            asChild so the anchor keeps the button's styling. A <button> firing
            a programmatic download would need JavaScript to do what an <a>
            does on its own.
          */
          <Button asChild variant="secondary" size="sm">
            <a href="/api/export" download>
              <Download />
              Unduh
            </a>
          </Button>
        }
      />
    </Card>
  )
}
