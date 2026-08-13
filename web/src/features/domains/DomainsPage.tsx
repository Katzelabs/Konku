import { SettingsSection } from '../settings/SettingsSection'
import DomainSettings from './DomainSettings'

/**
 * Domain management on its own route, inside the settings shell.
 *
 * The URL stays `/domains` — it was linkable before Pengaturan was split and
 * moving it under `/settings/` would break that for nothing. What changed is
 * what surrounds it: the rail is there, so the "← Pengaturan" link that used
 * to sit above the title is gone. Getting from here to Kategori is one click
 * now instead of a trip back through a screen nobody wanted to be on.
 */
export default function DomainsPage() {
  return (
    <SettingsSection
      title="Domain"
      description="Domain menandai catatan dan sesi fokus, dan jadi dasar rotasi mingguan. Target mingguan cuma penanda arah, bukan setoran — nol berarti domain tetap bisa dipakai tapi tidak ikut rotasi."
    >
      <DomainSettings />
    </SettingsSection>
  )
}
