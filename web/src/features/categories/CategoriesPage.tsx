import { useCopy } from '../../i18n'
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
  const c = useCopy().categories

  return (
    <SettingsSection title={c.title} description={c.description}>
      <CategorySettings />
    </SettingsSection>
  )
}
