import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/card'
import { SettingsSection } from './SettingsSection'

/**
 * What this app does with what you give it, and the two documents that say so
 * in full.
 *
 * Kept short here and linked rather than inlined: `/privacy` and `/terms` are
 * written against what the code actually stores and there is a test that fails
 * when a new feature stores something they do not mention (07 L9). A summary
 * that drifts from them would be worse than no summary.
 */
export default function AboutSettings() {
  return (
    <SettingsSection title="Tentang" description="Apa yang Konku simpan, dan dokumennya.">
      <Card className="flex flex-col gap-3 p-5 text-sm">
        <p className="text-secondary-fg">
          Konku menyimpan apa yang kamu tulis dan alamat email kamu. Tidak dijual,
          tidak dipakai untuk iklan, tidak dipakai melatih model AI.
        </p>
        <p className="text-muted-fg">
          Riwayat belajar kamu tidak pernah digabung dengan punya orang lain — semua
          angka di aplikasi ini dihitung untuk akun kamu sendiri.
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        <LegalLink to="/privacy" label="Kebijakan Privasi" />
        <LegalLink to="/terms" label="Ketentuan Layanan" />
      </div>
    </SettingsSection>
  )
}

/**
 * A row, not a sentence of links. Both documents open outside the app shell
 * (they are reachable signed out), so they are destinations rather than
 * inline references, and a row is what a destination looks like everywhere
 * else in this app.
 */
function LegalLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="block">
      <Card className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted">
        <span className="text-sm font-medium text-card-fg">{label}</span>
        <ExternalLink className="size-4 shrink-0 text-subtle-fg" />
      </Card>
    </Link>
  )
}
