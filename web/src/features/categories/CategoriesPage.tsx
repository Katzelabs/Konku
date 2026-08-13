import { SettingsSection } from '../settings/SettingsSection'
import CategorySettings from './CategorySettings'

/**
 * Category management on its own route, the same shape as `/domains`.
 *
 * Same reasoning as there: the URL is unchanged, the back link is gone because
 * the settings rail never leaves, and the two label screens are now siblings
 * you can move between directly rather than through Pengaturan.
 */
export default function CategoriesPage() {
  return (
    <SettingsSection
      title="Kategori"
      description="Satu kosakata yang dipakai bersama oleh catatan dan kartu. Biasanya kamu bikin langsung sambil nulis — di sini tempatnya kalau mau dirapikan."
    >
      <CategorySettings />
    </SettingsSection>
  )
}
